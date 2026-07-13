import cv2
import face_recognition
import pickle
import os
import time
import requests
import numpy as np

# Resolve absolute paths relative to this script
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ENCODINGS_PATH = os.path.join(BASE_DIR, "encodings.pkl")
FRAME_PATH = os.path.join(BASE_DIR, "latest_frame.jpg")

# Load initial encodings
known_face_encodings = []
known_face_names = []
last_encodings_mtime = 0

def load_encodings():
    global known_face_encodings, known_face_names, last_encodings_mtime
    if os.path.exists(ENCODINGS_PATH):
        try:
            with open(ENCODINGS_PATH, "rb") as f:
                known_face_encodings, known_face_names = pickle.load(f)
            last_encodings_mtime = os.path.getmtime(ENCODINGS_PATH)
            print(f"Loaded {len(known_face_encodings)} face encodings.")
        except Exception as e:
            print(f"Error loading encodings: {e}")
    else:
        known_face_encodings = []
        known_face_names = []
        last_encodings_mtime = 0

load_encodings()

attendance_cache = {}
COOLDOWN_SECONDS = 30

video_capture = cv2.VideoCapture(0)
video_capture.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
video_capture.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)

print("Starting face recognition. Saving frames to disk...")
print(f"Camera opened: {video_capture.isOpened()}")
frame_count = 0
read_fail_count = 0
MAX_READ_FAILS = 10

while True:
    ret, frame = video_capture.read()
    if not ret:
        read_fail_count += 1
        print(f"Failed to read frame from camera (attempt {read_fail_count}/{MAX_READ_FAILS}).")
        if read_fail_count >= MAX_READ_FAILS:
            print("Too many consecutive camera read failures. Exiting.")
            break
        time.sleep(0.1)
        continue
    read_fail_count = 0  # reset on successful read

    frame_count += 1

    # Reload encodings if updated
    if frame_count % 30 == 0:
        if os.path.exists(ENCODINGS_PATH):
            current_mtime = os.path.getmtime(ENCODINGS_PATH)
            if current_mtime > last_encodings_mtime:
                print("Reloading encodings...")
                load_encodings()

    # Resize frame to 1/2 size for faster face recognition
    small_frame = cv2.resize(frame, (0, 0), fx=0.5, fy=0.5)
    rgb_small_frame = cv2.cvtColor(small_frame, cv2.COLOR_BGR2RGB)
    rgb_small_frame = np.ascontiguousarray(rgb_small_frame)

    face_locations = face_recognition.face_locations(rgb_small_frame)
    face_encodings = face_recognition.face_encodings(rgb_small_frame, face_locations)

    for (top, right, bottom, left), face_encoding in zip(face_locations, face_encodings):
        top *= 2; right *= 2; bottom *= 2; left *= 2

        name = "Unknown"
        roll_number = ""

        if len(known_face_encodings) > 0:
            matches = face_recognition.compare_faces(known_face_encodings, face_encoding, tolerance=0.6)
            face_distances = face_recognition.face_distance(known_face_encodings, face_encoding)
            best_match_index = np.argmin(face_distances) if len(face_distances) > 0 else None

            if best_match_index is not None and matches[best_match_index]:
                name_key = known_face_names[best_match_index]
                if "_" in name_key:
                    parts = name_key.split("_")
                    name = parts[0]
                    roll_number = parts[1]
                else:
                    name = name_key
                    roll_number = "N/A"

        box_color = (0, 255, 0) if name != "Unknown" else (0, 0, 255)
        cv2.rectangle(frame, (left, top), (right, bottom), box_color, 2)

        label = f"{name} ({roll_number})" if roll_number else name
        # Draw filled label background for readability
        cv2.rectangle(frame, (left, top - 28), (right, top), box_color, -1)
        cv2.putText(frame, label, (left + 6, top - 7),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.65, (255, 255, 255), 2)

        if name != "Unknown" and roll_number:
            current_time = time.time()
            last_marked = attendance_cache.get(roll_number, 0)
            if current_time - last_marked > COOLDOWN_SECONDS:
                attendance_cache[roll_number] = current_time
                try:
                    response = requests.post(
                        "http://localhost:5000/attendance",
                        json={"studentName": name, "rollNumber": roll_number, "status": "Present"},
                        timeout=2
                    )
                    if response.status_code == 200:
                        print(f"Attendance marked: {name} ({roll_number}) ✅")
                except Exception as e:
                    print(f"API Error: {e}")

    # Draw a "SCANNING..." overlay text at top
    cv2.putText(frame, "SCANNING...", (10, 25),
                cv2.FONT_HERSHEY_SIMPLEX, 0.7, (99, 102, 241), 2)

    # Write the latest processed frame to disk
    cv2.imwrite(FRAME_PATH, frame)

video_capture.release()
# Clean up the frame file on exit
if os.path.exists(FRAME_PATH):
    os.remove(FRAME_PATH)
print("Camera released.")