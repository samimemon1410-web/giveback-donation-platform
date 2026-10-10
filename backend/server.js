require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const path = require("path");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("./models/User");
const Donation = require("./models/Donation");

const app = express();

app.use(cors());
app.use(express.json());

// Serve the website (frontend folder) from this same server
app.use(express.static(path.join(__dirname, "../frontend")));

mongoose
    .connect(process.env.MONGO_URI)
    .then(() => console.log("MongoDB connected"))
    .catch((err) => console.log("MongoDB connection error:", err.message));

// ---------- Login check (middleware) ----------
function requireLogin(req, res, next) {
    const header = req.headers.authorization || "";
    const token = header.replace("Bearer ", "");

    if (!token) {
        return res.status(401).json({ message: "Please log in first." });
    }

    try {
        req.user = jwt.verify(token, process.env.JWT_SECRET);
        next();
    } catch (err) {
        res.status(401).json({ message: "Session expired. Please log in again." });
    }
}

// ---------- Admin check (use after requireLogin) ----------
function requireAdmin(req, res, next) {
    if (req.user.role !== "admin") {
        return res.status(403).json({ message: "Only admins can do this." });
    }
    next();
}

// ---------- List of NGOs (only NGOs verified by the admin) ----------
app.get("/api/ngos", async (req, res) => {
    try {
        const ngos = await User.find({ role: "ngo", verified: true }).sort({ name: 1 });
        res.json(
            ngos.map((ngo) => ({ id: ngo._id, name: ngo.name, city: ngo.address }))
        );
    } catch (err) {
        console.log(err.message);
        res.status(500).json({ message: "Server error. Please try again." });
    }
});

// ---------- Register ----------
app.post("/api/register", async (req, res) => {
    try {
        const { role, name, email, phone, address, password } = req.body;

        if (!name || !email || !phone || !address || !password) {
            return res.status(400).json({ message: "Please fill in all fields." });
        }
        if (password.length < 6) {
            return res.status(400).json({ message: "Password must be at least 6 characters." });
        }

        const existing = await User.findOne({ email: email.toLowerCase() });
        if (existing) {
            return res.status(400).json({ message: "This email is already registered." });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const safeRole = role === "ngo" ? "ngo" : "donor";

        await User.create({
            role: safeRole,
            name,
            email,
            phone,
            address,
            password: hashedPassword
        });

        res.status(201).json({ message: "Registration successful! You can now log in." });
    } catch (err) {
        console.log(err.message);
        res.status(500).json({ message: "Server error. Please try again." });
    }
});

// ---------- Login ----------
app.post("/api/login", async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ message: "Please enter email and password." });
        }

        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) {
            return res.status(400).json({ message: "Invalid email or password." });
        }

        const match = await bcrypt.compare(password, user.password);
        if (!match) {
            return res.status(400).json({ message: "Invalid email or password." });
        }

        const token = jwt.sign(
            { id: user._id, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: "7d" }
        );

        res.json({
            message: "Login successful!",
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                verified: user.verified
            }
        });
    } catch (err) {
        console.log(err.message);
        res.status(500).json({ message: "Server error. Please try again." });
    }
});

// ---------- Create a donation ----------
app.post("/api/donations", requireLogin, async (req, res) => {
    try {
        const { category, quantity, description, ngoId, pickupAddress, pickupDate } = req.body;

        if (!category || !quantity || !description || !ngoId || !pickupAddress || !pickupDate) {
            return res.status(400).json({ message: "Please fill in all fields." });
        }

        if (!mongoose.Types.ObjectId.isValid(ngoId)) {
            return res.status(400).json({ message: "Please choose an NGO from the list." });
        }

        const ngo = await User.findOne({ _id: ngoId, role: "ngo", verified: true });
        if (!ngo) {
            return res.status(400).json({ message: "Please choose an NGO from the list." });
        }

        await Donation.create({
            donor: req.user.id,
            ngo: ngo._id,
            ngoName: ngo.name,
            category,
            quantity,
            description,
            pickupAddress,
            pickupDate
        });

        res.status(201).json({ message: "Donation scheduled successfully!" });
    } catch (err) {
        console.log(err.message);
        res.status(500).json({ message: "Server error. Please try again." });
    }
});

// ---------- Who am I? (fresh account info) ----------
app.get("/api/me", requireLogin, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select("name email role verified");
        if (!user) {
            return res.status(404).json({ message: "Account not found." });
        }
        res.json(user);
    } catch (err) {
        console.log(err.message);
        res.status(500).json({ message: "Server error. Please try again." });
    }
});

// ---------- My donations ----------
app.get("/api/donations/my", requireLogin, async (req, res) => {
    try {
        const donations = await Donation.find({ donor: req.user.id }).sort({ createdAt: -1 });
        res.json(donations);
    } catch (err) {
        console.log(err.message);
        res.status(500).json({ message: "Server error. Please try again." });
    }
});

// ---------- NGO: donations sent to this NGO ----------
app.get("/api/donations/ngo", requireLogin, async (req, res) => {
    try {
        if (req.user.role !== "ngo") {
            return res.status(403).json({ message: "Only NGO accounts can see this page." });
        }

        const donations = await Donation.find({ ngo: req.user.id })
            .populate("donor", "name phone")
            .sort({ createdAt: -1 });

        res.json(donations);
    } catch (err) {
        console.log(err.message);
        res.status(500).json({ message: "Server error. Please try again." });
    }
});

// ---------- NGO: change the status of a donation ----------
app.patch("/api/donations/:id/status", requireLogin, async (req, res) => {
    try {
        if (req.user.role !== "ngo") {
            return res.status(403).json({ message: "Only NGO accounts can do this." });
        }

        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(404).json({ message: "Donation not found." });
        }

        const donation = await Donation.findOne({ _id: req.params.id, ngo: req.user.id });
        if (!donation) {
            return res.status(404).json({ message: "Donation not found." });
        }

        const { status } = req.body;

        // Which status can change into which
        const allowed = {
            Pending: ["Accepted", "Cancelled"],
            Accepted: ["Collected", "Cancelled"]
        };

        const nextOptions = allowed[donation.status] || [];
        if (!nextOptions.includes(status)) {
            return res.status(400).json({ message: "This status change is not allowed." });
        }

        donation.status = status;
        await donation.save();

        res.json({ message: "Status updated to " + status + "." });
    } catch (err) {
        console.log(err.message);
        res.status(500).json({ message: "Server error. Please try again." });
    }
});

// ---------- ADMIN: overview numbers for reports ----------
app.get("/api/admin/stats", requireLogin, requireAdmin, async (req, res) => {
    try {
        const donors = await User.countDocuments({ role: "donor" });
        const ngos = await User.countDocuments({ role: "ngo" });
        const verifiedNgos = await User.countDocuments({ role: "ngo", verified: true });
        const donations = await Donation.countDocuments();

        const byStatus = await Donation.aggregate([
            { $group: { _id: "$status", count: { $sum: 1 } } }
        ]);

        const byCategory = await Donation.aggregate([
            { $group: { _id: "$category", count: { $sum: 1 }, items: { $sum: "$quantity" } } },
            { $sort: { items: -1 } }
        ]);

        const status = { Pending: 0, Accepted: 0, Collected: 0, Cancelled: 0 };
        byStatus.forEach((s) => {
            status[s._id] = s.count;
        });

        res.json({ donors, ngos, verifiedNgos, donations, status, byCategory });
    } catch (err) {
        console.log(err.message);
        res.status(500).json({ message: "Server error. Please try again." });
    }
});

// ---------- ADMIN: all NGO accounts ----------
app.get("/api/admin/ngos", requireLogin, requireAdmin, async (req, res) => {
    try {
        const ngos = await User.find({ role: "ngo" })
            .select("name email phone address verified createdAt")
            .sort({ createdAt: -1 });
        res.json(ngos);
    } catch (err) {
        console.log(err.message);
        res.status(500).json({ message: "Server error. Please try again." });
    }
});

// ---------- ADMIN: verify or un-verify an NGO ----------
app.patch("/api/admin/ngos/:id/verify", requireLogin, requireAdmin, async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(404).json({ message: "NGO not found." });
        }

        const verified = req.body.verified === true;

        const ngo = await User.findOneAndUpdate(
            { _id: req.params.id, role: "ngo" },
            { verified: verified },
            { new: true }
        );

        if (!ngo) {
            return res.status(404).json({ message: "NGO not found." });
        }

        res.json({ message: ngo.name + (verified ? " is now verified." : " is no longer verified.") });
    } catch (err) {
        console.log(err.message);
        res.status(500).json({ message: "Server error. Please try again." });
    }
});

// ---------- ADMIN: all donations on the platform ----------
app.get("/api/admin/donations", requireLogin, requireAdmin, async (req, res) => {
    try {
        const donations = await Donation.find()
            .populate("donor", "name email")
            .sort({ createdAt: -1 });
        res.json(donations);
    } catch (err) {
        console.log(err.message);
        res.status(500).json({ message: "Server error. Please try again." });
    }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log("Server running at http://localhost:" + PORT);
});