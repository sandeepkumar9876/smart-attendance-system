import face_recognition
import os
import pickle

# Resolve absolute paths relative to this script
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
KNOWN_FACES_DIR = os.path.join(BASE_DIR, "known_faces")
ENCODINGS_PATH = os.path.join(BASE_DIR, "encodings.pkl")

# Ensure known_faces directory exists
if not os.path.exists(KNOWN_FACES_DIR):
    os.makedirs(KNOWN_FACES_DIR)

known_face_encodings = []
known_face_names = []

print("Scanning known faces...")
for filename in os.listdir(KNOWN_FACES_DIR):
    if filename.lower().endswith((".jpg", ".jpeg", ".png")):
        image_path = os.path.join(KNOWN_FACES_DIR, filename)
        try:
            image = face_recognition.load_image_file(image_path)
            encodings = face_recognition.face_encodings(image)

            if len(encodings) > 0:
                known_face_encodings.append(encodings[0])
                # Store the base filename without extension (e.g., "Sandeep_12345")
                name_key = os.path.splitext(filename)[0]
                known_face_names.append(name_key)
                print(f"Encoded face for: {name_key}")
            else:
                print(f"Warning: No face found in {filename}")
        except Exception as e:
            print(f"Error encoding {filename}: {e}")

with open(ENCODINGS_PATH, "wb") as f:
    pickle.dump((known_face_encodings, known_face_names), f)

print(f"Faces encoded successfully! Total encoded: {len(known_face_encodings)}")