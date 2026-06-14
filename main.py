from flask import Flask, render_template, Response, jsonify
import cv2
import numpy as np
import threading
import time

app = Flask(__name__)

# ------------------------------------------------------------------------------
# GLOBAL STATE (FIXED __init__)
# ------------------------------------------------------------------------------
class DetectionState:
    def __init__(self):   # ✅ FIXED
        self.current_color = "None"
        self.previous_color = "None"
        self.color_changed = False
        self.confidence = 0
        self.lock = threading.Lock()
        self.last_change_time = time.time()

    def update(self, color, confidence):
        with self.lock:
            self.confidence = confidence

            if color != self.current_color:
                if color == self.previous_color:
                    if time.time() - self.last_change_time > 0.3:
                        self.current_color = color
                        self.color_changed = True
                else:
                    self.previous_color = color
                    self.last_change_time = time.time()

    def get_state(self):
        with self.lock:
            changed = self.color_changed
            self.color_changed = False
            return {
                "color": self.current_color,
                "changed": changed,
                "confidence": self.confidence
            }

state = DetectionState()

# ------------------------------------------------------------------------------
# CAMERA
# ------------------------------------------------------------------------------
CAMERA_SOURCE = 0

# ------------------------------------------------------------------------------
# IMPROVED HSV RANGES (REALISTIC)
# ------------------------------------------------------------------------------
COLOR_RANGES = {
    "Red": [
        {"lower": np.array([0, 100, 100]), "upper": np.array([10, 255, 255])},
        {"lower": np.array([160, 100, 100]), "upper": np.array([180, 255, 255])}
    ],
    "Yellow": [
        {"lower": np.array([15, 80, 80]), "upper": np.array([35, 255, 255])}
    ],
    "Green": [
        {"lower": np.array([40, 50, 50]), "upper": np.array([90, 255, 255])}
    ]
}

MIN_CONTOUR_AREA = 100   # ✅ LOWERED
MIN_CONFIDENCE = 5       # ✅ LOWERED

# ------------------------------------------------------------------------------
# DETECTION FUNCTION (FIXED LOGIC)
# ------------------------------------------------------------------------------
def detect_signal_color(frame):

    hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
    hsv = cv2.GaussianBlur(hsv, (5, 5), 0)

    detected_color = "None"
    max_area = 0
    best_contour = None
    best_color = None

    for color_name, ranges in COLOR_RANGES.items():

        combined_mask = np.zeros(hsv.shape[:2], dtype=np.uint8)

        for r in ranges:
            mask = cv2.inRange(hsv, r["lower"], r["upper"])
            combined_mask = cv2.bitwise_or(combined_mask, mask)

        # clean mask
        kernel = np.ones((5, 5), np.uint8)
        combined_mask = cv2.morphologyEx(combined_mask, cv2.MORPH_OPEN, kernel)
        combined_mask = cv2.morphologyEx(combined_mask, cv2.MORPH_CLOSE, kernel)

        contours, _ = cv2.findContours(
            combined_mask,
            cv2.RETR_EXTERNAL,
            cv2.CHAIN_APPROX_SIMPLE
        )

        for contour in contours:
            area = cv2.contourArea(contour)

            if area > MIN_CONTOUR_AREA and area > max_area:
                max_area = area
                best_contour = contour
                best_color = color_name

    # ✅ FIXED CONFIDENCE
    confidence = int(max_area / 50)
    confidence = min(confidence, 100)

    if best_contour is not None and confidence >= MIN_CONFIDENCE:
        detected_color = best_color

        x, y, w, h = cv2.boundingRect(best_contour)

        draw_colors = {
            "Red": (0, 0, 255),
            "Yellow": (0, 255, 255),
            "Green": (0, 255, 0)
        }

        color = draw_colors.get(detected_color, (255, 255, 255))

        cv2.rectangle(frame, (x, y), (x + w, y + h), color, 3)

        label = f"{detected_color} ({confidence}%)"
        cv2.putText(frame, label, (x, y - 10),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, color, 2)

    # STATUS BAR
    status_color = {
        "Red": (0, 0, 200),
        "Yellow": (0, 200, 200),
        "Green": (0, 200, 0),
        "None": (100, 100, 100)
    }.get(detected_color)

    cv2.rectangle(frame, (0, 0), (frame.shape[1], 40), status_color, -1)

    cv2.putText(frame, f"Detected: {detected_color}",
                (10, 28),
                cv2.FONT_HERSHEY_SIMPLEX, 0.9,
                (255, 255, 255), 2)

    # DEBUG (VERY IMPORTANT)
    print("Color:", detected_color, "Area:", max_area, "Conf:", confidence)

    return detected_color, confidence, frame

# ------------------------------------------------------------------------------
# VIDEO STREAM
# ------------------------------------------------------------------------------
def generate_frames():
    camera = cv2.VideoCapture(CAMERA_SOURCE)

    if not camera.isOpened():
        print("Camera not working ❌")
        return

    while True:
        success, frame = camera.read()
        if not success:
            break

        color, confidence, frame = detect_signal_color(frame)
        state.update(color, confidence)

        ret, buffer = cv2.imencode('.jpg', frame)
        frame_bytes = buffer.tobytes()

        yield (b'--frame\r\n'
               b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')

    camera.release()

# ------------------------------------------------------------------------------
# ROUTES
# ------------------------------------------------------------------------------
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/video_feed')
def video_feed():
    return Response(generate_frames(),
                    mimetype='multipart/x-mixed-replace; boundary=frame')

@app.route('/status')
def status():
    return jsonify(state.get_state())

# ------------------------------------------------------------------------------
# MAIN
# ------------------------------------------------------------------------------
if __name__ == '__main__':
    print("Starting Traffic Detection...")
    app.run(host='0.0.0.0', port=5000, debug=True)
