const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
    role: { type: String, enum: ["donor", "ngo", "admin"], default: "donor" },
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    phone: { type: String, required: true },
    address: { type: String, required: true },
    password: { type: String, required: true },
    verified: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("User", userSchema);