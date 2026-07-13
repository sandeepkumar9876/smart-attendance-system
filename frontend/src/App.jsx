import { useState, useEffect, useRef } from "react";
import "./App.css";

function App() {
  // Registration Form States
  const [name, setName] = useState("");
  const [rollNumber, setRollNumber] = useState("");
  const [email, setEmail] = useState("");
  const [photo, setPhoto] = useState(null); // base64 string
  const [cameraActive, setCameraActive] = useState(false);
  const [registering, setRegistering] = useState(false);

  // App Data States
  const [students, setStudents] = useState([]);
  const [attendanceToday, setAttendanceToday] = useState([]);
  const [isRecognitionRunning, setIsRecognitionRunning] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [frameUrl, setFrameUrl] = useState(null); // current polled frame URL
  const [activeTab, setActiveTab] = useState("attendance"); // "attendance" or "students"

  const framePollRef = useRef(null);

  const videoRef = useRef(null);
  const streamRef = useRef(null);

  // Fetch initial data and start polling
  useEffect(() => {
    fetchStudents();
    fetchAttendanceToday();
    checkRecognitionStatus();

    // Poll attendance log and recognition status every 2 seconds
    const interval = setInterval(() => {
      fetchAttendanceToday();
      checkRecognitionStatus();
    }, 2000);

    return () => {
      clearInterval(interval);
      stopWebcam();
      if (framePollRef.current) clearInterval(framePollRef.current);
    };
  }, []);

  // Start / stop frame polling whenever recognition state changes
  useEffect(() => {
    if (isRecognitionRunning) {
      // Poll for a new frame from the backend every 100ms
      framePollRef.current = setInterval(() => {
        // Append timestamp to bust cache every time
        setFrameUrl(`http://localhost:5000/latest_frame?t=${Date.now()}`);
      }, 100);
    } else {
      // Stop polling and clear the image
      if (framePollRef.current) {
        clearInterval(framePollRef.current);
        framePollRef.current = null;
      }
      setFrameUrl(null);
    }
    return () => {
      if (framePollRef.current) {
        clearInterval(framePollRef.current);
        framePollRef.current = null;
      }
    };
  }, [isRecognitionRunning]);

  // Attach camera stream to video element when camera becomes active in the DOM
  useEffect(() => {
    if (cameraActive && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [cameraActive]);

  const fetchStudents = async () => {
    try {
      const response = await fetch("http://localhost:5000/students");
      if (response.ok) {
        const data = await response.json();
        setStudents(data);
      }
    } catch (err) {
      console.error("Failed to fetch students:", err);
    }
  };

  const fetchAttendanceToday = async () => {
    try {
      const response = await fetch("http://localhost:5000/attendance/today");
      if (response.ok) {
        const data = await response.json();
        setAttendanceToday(data);
      }
    } catch (err) {
      console.error("Failed to fetch attendance:", err);
    }
  };

  const checkRecognitionStatus = async () => {
    try {
      const response = await fetch("http://localhost:5000/status-recognition");
      if (response.ok) {
        const data = await response.json();
        setIsRecognitionRunning(data.running);
      }
    } catch (err) {
      console.error("Failed to fetch recognition status:", err);
    }
  };

  // Start HTML5 Web Camera for registration capture
  const startWebcam = async () => {
    try {
      setPhoto(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: "user" }
      });
      streamRef.current = stream;
      setCameraActive(true);
    } catch (err) {
      console.error("Webcam access error:", err);
      alert("Unable to access webcam. Please verify camera permissions in your browser.");
    }
  };

  // Stop Webcam stream
  const stopWebcam = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  // Capture Frame from Video
  const capturePhoto = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement("canvas");
    canvas.width = videoRef.current.videoWidth || 640;
    canvas.height = videoRef.current.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg");
    setPhoto(dataUrl);
    stopWebcam();
  };

  // Submit registration form
  const handleRegister = async (e) => {
    e.preventDefault();
    if (!name || !rollNumber || !email) {
      alert("Please fill in all student details.");
      return;
    }
    if (!photo) {
      alert("Please capture a registration photo first.");
      return;
    }

    setRegistering(true);
    try {
      const response = await fetch("http://localhost:5000/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, rollNumber, email, photo })
      });
      const data = await response.json();
      if (response.ok) {
        alert(data.message);
        // Reset form
        setName("");
        setRollNumber("");
        setEmail("");
        setPhoto(null);
        fetchStudents();
      } else {
        alert(data.message || "Registration failed");
      }
    } catch (err) {
      console.error("Connection error:", err);
      alert("Error contacting the backend server.");
    } finally {
      setRegistering(false);
    }
  };

  // Control desktop python camera recognition
  const toggleRecognition = async () => {
    const endpoint = isRecognitionRunning ? "stop-recognition" : "start-recognition";
    try {
      const response = await fetch(`http://localhost:5000/${endpoint}`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) {
        alert(data.message || "Operation failed.");
      }
      await checkRecognitionStatus();
    } catch (err) {
      console.error("Error toggling recognition:", err);
      alert("Error contacting the backend server.");
    }
  };

  return (
    <div className="app-container">
      {/* Premium Header */}
      <header className="app-header">
        <div className="logo-section">
          <span className="logo-dot pulse"></span>
          <h1>Smart Vision Attendance</h1>
        </div>
        <p className="subtitle">Windows Face Recognition Attendance System</p>
      </header>

      {/* Grid Dashboard */}
      <main className="dashboard-grid">
        {/* Left Card: Registration Panel */}
        <section className="dashboard-card registration-card">
          <h2>Student Registration</h2>
          <p className="card-desc">Register new student and capture face credentials</p>

          <form onSubmit={handleRegister} className="registration-form">
            <div className="input-group">
              <label htmlFor="student-name">Full Name</label>
              <input
                id="student-name"
                type="text"
                placeholder="Enter student's full name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <div className="input-group">
              <label htmlFor="student-roll">Roll Number</label>
              <input
                id="student-roll"
                type="text"
                placeholder="Enter unique roll number"
                value={rollNumber}
                onChange={(e) => setRollNumber(e.target.value)}
                required
              />
            </div>

            <div className="input-group">
              <label htmlFor="student-email">Email Address</label>
              <input
                id="student-email"
                type="email"
                placeholder="Enter email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            {/* Webcam / Capture Area */}
            <div className="camera-container">
              {cameraActive && (
                <div className="webcam-feed">
                  <video ref={videoRef} autoPlay playsInline muted id="register-video" />
                  <button type="button" onClick={capturePhoto} className="btn btn-capture">
                    Capture Photo
                  </button>
                </div>
              )}

              {photo && (
                <div className="photo-preview">
                  <img src={photo} alt="Student Captured Preview" />
                  <div className="preview-overlay">
                    <button type="button" onClick={startWebcam} className="btn btn-secondary">
                      Retake
                    </button>
                  </div>
                </div>
              )}

              {!cameraActive && !photo && (
                <div className="camera-placeholder">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="camera-icon">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM18.75 10.5h.008v.008h-.008V10.5Z" />
                  </svg>
                  <button type="button" onClick={startWebcam} className="btn btn-secondary">
                    Open Camera
                  </button>
                </div>
              )}
            </div>

            <button type="submit" disabled={registering} className="btn btn-primary btn-submit">
              {registering ? "Registering Student..." : "Register Student"}
            </button>
          </form>
        </section>

        {/* Right Panel: Attendance Controller and Logs */}
        <section className="dashboard-card main-panel">
          {/* Recognition Engine Control Panel */}
          <div className="control-bar glass">
            <div className="status-indicator">
              <span className={`status-dot ${isRecognitionRunning ? "running" : isStarting ? "starting" : "stopped"}`}></span>
              <div>
                <h3>Recognition System</h3>
                <p>{isRecognitionRunning ? "Active & Scanning" : isStarting ? "Starting camera, please wait..." : "Offline / Camera Stopped"}</p>
              </div>
            </div>
            <button
              onClick={toggleRecognition}
              disabled={isStarting}
              className={`btn btn-toggle ${isRecognitionRunning ? "btn-stop" : "btn-start"}`}
            >
              {isStarting ? "Starting..." : isRecognitionRunning ? "Stop Camera Feed" : "Start Camera Feed"}
            </button>
          </div>

          {/* Live Scanner Feed Container - polled JPEG frames from backend */}
          {isRecognitionRunning && (
            <div className="live-stream-container">
              <div className="stream-badge">LIVE SCANNER FEED</div>
              {frameUrl ? (
                <img
                  src={frameUrl}
                  alt="Live Face Recognition Scan"
                  className="live-stream-img"
                  onError={() => { /* ignore 204 responses during startup */ }}
                />
              ) : (
                <div className="stream-loading">
                  <div className="spinner"></div>
                  <p>Waiting for camera to initialize...</p>
                </div>
              )}
              <div className="stream-overlay">
                <span className="scanner-line"></span>
              </div>
            </div>
          )}

          {/* Navigation Tabs */}
          <div className="tabs-header">
            <button
              onClick={() => setActiveTab("attendance")}
              className={`tab-btn ${activeTab === "attendance" ? "active" : ""}`}
            >
              Today's Attendance ({attendanceToday.length})
            </button>
            <button
              onClick={() => setActiveTab("students")}
              className={`tab-btn ${activeTab === "students" ? "active" : ""}`}
            >
              Registered Students ({students.length})
            </button>
          </div>

          {/* Tab Content */}
          <div className="tab-content">
            {activeTab === "attendance" && (
              <div className="logs-container">
                {attendanceToday.length === 0 ? (
                  <div className="empty-state">
                    <p>No attendance records logged for today yet.</p>
                    <span>Start the Camera Feed to begin matching faces automatically.</span>
                  </div>
                ) : (
                  <div className="table-responsive">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Roll Number</th>
                          <th>Student Name</th>
                          <th>Time Marked</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {attendanceToday.map((log) => (
                          <tr key={log._id}>
                            <td className="font-mono">{log.rollNumber}</td>
                            <td><strong>{log.studentName}</strong></td>
                            <td>{new Date(log.date).toLocaleTimeString()}</td>
                            <td>
                              <span className="badge badge-present">{log.status}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {activeTab === "students" && (
              <div className="logs-container">
                {students.length === 0 ? (
                  <div className="empty-state">
                    <p>No students registered in the database.</p>
                    <span>Register a student using the form on the left.</span>
                  </div>
                ) : (
                  <div className="table-responsive">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Roll Number</th>
                          <th>Student Name</th>
                          <th>Email Address</th>
                        </tr>
                      </thead>
                      <tbody>
                        {students.map((student) => (
                          <tr key={student._id}>
                            <td className="font-mono">{student.rollNumber}</td>
                            <td><strong>{student.name}</strong></td>
                            <td>{student.email}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;