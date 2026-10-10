// Run once: node make-admin.js your@email.com
// Turns an existing account into an admin account.
require("dotenv").config();
const mongoose = require("mongoose");
const User = require("./models/User");

async function main() {
    const email = (process.argv[2] || "").toLowerCase();

    if (!email) {
        console.log("Please write the email after the command, like this:");
        console.log("node make-admin.js your@email.com");
        return;
    }

    await mongoose.connect(process.env.MONGO_URI);

    const user = await User.findOneAndUpdate(
        { email: email },
        { role: "admin", verified: true },
        { new: true }
    );

    if (user) {
        console.log("Done! " + user.name + " (" + user.email + ") is now an admin.");
    } else {
        console.log("No account found with the email " + email);
    }

    await mongoose.disconnect();
}

main().catch(function (err) {
    console.log("Error:", err.message);
    mongoose.disconnect();
});