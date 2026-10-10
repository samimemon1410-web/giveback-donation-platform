const mongoose = require("mongoose");

const donationSchema = new mongoose.Schema({
    donor: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    ngo: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    category: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 },
    description: { type: String, required: true },
    ngoName: { type: String, required: true },
    pickupAddress: { type: String, required: true },
    pickupDate: { type: String, required: true },
    status: {
        type: String,
        enum: ["Pending", "Accepted", "Collected", "Cancelled"],
        default: "Pending"
    },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Donation", donationSchema);