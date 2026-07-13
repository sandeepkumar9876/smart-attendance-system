const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const { exec, spawn } = require("child_process");
const Student = require("./models/Student");
const Attendance = require("./models/Attendance");

const app = express();
app.use(cors());
// Set JSON body limit high enough to accept webcam base64 images
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

mongoose.connect("mongodb://127.0.0.1:27017/smartAttendance")
  .then(() => {
      console.log("MongoDB Connected ✅");
  })
  .catch((err) => {
      console.log("MongoDB Error:", err);
  });

// Global reference for Python Face Recognition child process
let recognitionProcess = null;

// Resolve Paths relative to server directory
const pythonPath = path.join(__dirname, "../python-ai/face-recognition/venv/Scripts/python.exe");
const encodeScriptPath = path.join(__dirname, "../python-ai/face-recognition/encode_faces.py");
const recognizeScriptPath = path.join(__dirname, "../python-ai/face-recognition/recognize_face.py");
const knownFacesDir = path.join(__dirname, "../python-ai/face-recognition/known_faces");

// Path where Python writes the latest recognized frame as a JPEG file
const FRAME_PATH = path.join(__dirname, "../python-ai/face-recognition/latest_frame.jpg");

// Ensure known_faces directory exists
if (!fs.existsSync(knownFacesDir)) {
    fs.mkdirSync(knownFacesDir, { recursive: true });
}

// Home route
app.get("/", (req, res) => {
    res.send("Smart Vision Attendance Backend Running 🚀");
});

// Get List of Registered Students
app.get("/students", async (req, res) => {
    try {
        const students = await Student.find().sort({ _id: -1 });
        res.json(students);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Student Registration API (Accepts details + Base64 photo)
app.post("/register", async (req, res) => {
    try {
        const { name, rollNumber, email, photo } = req.body;

        if (!name || !rollNumber || !email) {
            return res.status(400).json({ message: "All fields are required!" });
        }

        // Check if student roll number already exists
        const existingStudent = await Student.findOne({ rollNumber });
        if (existingStudent) {
            return res.status(400).json({ message: "Student with this Roll Number is already registered!" });
        }

        // Save Student details to MongoDB
        const student = new Student({ name, rollNumber, email });
        await student.save();

        // Save Photo if base64 photo is provided
        if (photo) {
            // Remove data URI prefix (e.g. "data:image/jpeg;base64,")
            const base64Data = photo.replace(/^data:image\/\w+;base64,/, "");
            const buffer = Buffer.from(base64Data, "base64");
            
            // Format name for file system (replace spaces with underscores or keep simple)
            const cleanName = name.replace(/\s+/g, "_");
            const photoPath = path.join(knownFacesDir, `${cleanName}_${rollNumber}.jpg`);
            
            fs.writeFileSync(photoPath, buffer);
            console.log(`Saved student photo: ${photoPath}`);

            // Automatically run encode_faces.py to compile encodings
            console.log("Running encode_faces.py...");
            exec(`"${pythonPath}" "${encodeScriptPath}"`, (error, stdout, stderr) => {
                if (error) {
                    console.error(`Error running encoding script: ${error.message}`);
                    return;
                }
                if (stderr) {
                    console.error(`Encoding script stderr: ${stderr}`);
                }
                console.log(`Encoding script output: ${stdout}`);
            });
        }

        res.json({
            message: "Student Registered and Face Photo Saved Successfully ✅",
            student: student
        });

    } catch (error) {
        console.error("Register Error:", error);
        res.status(500).json({
            message: error.message
        });
    }
});

// Mark Attendance API
app.post("/attendance", async (req, res) => {
    try {
        const { studentName, rollNumber, status } = req.body;

        // Check if student has already been marked present today
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);

        const endOfDay = new Date();
        endOfDay.setHours(23, 59, 59, 999);

        const existingAttendance = await Attendance.findOne({
            rollNumber: rollNumber,
            date: { $gte: startOfDay, $lte: endOfDay }
        });

        if (existingAttendance) {
            return res.json({
                message: `${studentName} is already marked Present today.`,
                attendance: existingAttendance
            });
        }

        const attendance = new Attendance({
            studentName,
            rollNumber,
            status: status || "Present"
        });

        await attendance.save();

        res.json({
            message: `Attendance marked for ${studentName} ✅`,
            attendance: attendance
        });

    } catch (error) {
        res.status(500).json({
            message: error.message
        });
    }
});

// Get Today's Attendance Logs
app.get("/attendance/today", async (req, res) => {
    try {
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);

        const endOfDay = new Date();
        endOfDay.setHours(23, 59, 59, 999);

        const logs = await Attendance.find({
            date: { $gte: startOfDay, $lte: endOfDay }
        }).sort({ date: -1 });

        res.json(logs);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Start Face Recognition Camera Feed Process
app.post("/start-recognition", (req, res) => {
    if (recognitionProcess !== null) {
        return res.json({ message: "Face recognition camera is already running." });
    }

    console.log("Spawning Face Recognition process...");
    
    recognitionProcess = spawn(pythonPath, [recognizeScriptPath], {
        cwd: path.dirname(recognizeScriptPath)
    });

    recognitionProcess.stdout.on("data", (data) => {
        console.log(`[Python AI]: ${data.toString().trim()}`);
    });

    recognitionProcess.stderr.on("data", (data) => {
        // Note: Python often writes info to stderr, don't panic
        console.log(`[Python AI]: ${data.toString().trim()}`);
    });

    recognitionProcess.on("close", (code) => {
        console.log(`[Python AI] Process exited with code ${code}`);
        recognitionProcess = null;
    });

    // Respond immediately — no need to wait for Flask port
    res.json({ message: "Face recognition started 🚀" });
});

// Stop Face Recognition Camera Feed Process
app.post("/stop-recognition", (req, res) => {
    if (recognitionProcess === null) {
        return res.json({ message: "Face recognition camera is not running." });
    }

    console.log("Stopping Face Recognition process...");
    recognitionProcess.kill("SIGKILL");
    recognitionProcess = null;

    // Clean up frame file
    if (fs.existsSync(FRAME_PATH)) {
        fs.unlinkSync(FRAME_PATH);
    }

    res.json({ message: "Face recognition stopped 🛑" });
});

// Check Face Recognition Status
app.get("/status-recognition", (req, res) => {
    res.json({ running: recognitionProcess !== null });
});

// ------------------------------------------------------------------
// FRAME ENDPOINT: Python writes latest_frame.jpg to disk every ~100ms.
// This route just reads that file and sends it to the browser.
// React polls this every 100ms with cache-busting to create the illusion
// of a live video feed — no MJPEG, no ports, no proxy issues.
// ------------------------------------------------------------------
app.get("/latest_frame", (req, res) => {
    if (recognitionProcess === null) {
        return res.status(404).send("Camera not active.");
    }

    if (!fs.existsSync(FRAME_PATH)) {
        // Frame not yet written — return 204 No Content (try again soon)
        return res.status(204).end();
    }

    try {
        const imageBuffer = fs.readFileSync(FRAME_PATH);
        res.set("Content-Type", "image/jpeg");
        // Prevent any caching so each request fetches a fresh frame
        res.set("Cache-Control", "no-store, no-cache, must-revalidate");
        res.set("Pragma", "no-cache");
        res.send(imageBuffer);
    } catch (err) {
        // File mid-write race condition — browser will retry on next poll
        res.status(204).end();
    }
});

// Cleanup processes on server exit
process.on("exit", () => {
    if (recognitionProcess) {
        recognitionProcess.kill();
    }
});

process.on("SIGINT", () => {
    if (recognitionProcess) {
        recognitionProcess.kill("SIGKILL");
    }
    process.exit();
});

app.listen(5000, () => {
    console.log("Server running on port 5000");
});