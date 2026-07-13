const mongoose = require("mongoose");

const attendanceSchema = new mongoose.Schema({

    studentName: {
        type: String,
        required: true
    },

    rollNumber: {
        type: String,
        required: true
    },

    date: {
        type: Date,
        default: Date.now
    },

    status: {
        type: String,
        default: "Present"
    }

});


module.exports = mongoose.model("Attendance", attendanceSchema);