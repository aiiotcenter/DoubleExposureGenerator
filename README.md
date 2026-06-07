# Double Exposure Darkroom Studio

Analogue Vision · Digital Alchemy

## About the Project

This repository contains a graduation project ("Senior Project") that allows users to create stunning double-exposure artworks by blending two images (a portrait/base layer and a nature/texture layer). It combines classic film photography techniques with modern web technologies and AI-powered masking.

## Features

- **AI Subject Masking**: Automatically isolates the subject's silhouette using MediaPipe's Selfie Segmentation.
- **Double Exposure Blending**: Classic film techniques brought to the digital darkroom with various blend modes (Screen, Multiply, Overlay, etc.) and style presets (Classic, Forest, Ghost, Noir, Golden, Cosmic, Dusk).
- **Fine-Tune Controls**: Adjust opacity, contrast, brightness, sepia tone, film grain, light leak, and halation to achieve the perfect look.
- **Remote Upload via Phone**: Seamlessly pair a smartphone with the laptop using Ably Realtime to capture or upload images remotely (`remote.html`).
- **Download & Share**: Export the developed artwork in high resolution (JPG, PNG, WEBP) or send it directly to your phone via a QR code (using ImgBB API).
- **Camera Integration**: Built-in webcam support to take selfies directly from the application.
- **Idle Reset**: Automatically resets the interface for the next person if left idle, making it perfect for photobooth-style event setups.

## Technologies Built With

- **Frontend Core**: HTML5, CSS3, Vanilla JavaScript (ES6+), HTML5 Canvas API.
- **AI & Machine Learning**: [MediaPipe Selfie Segmentation](https://developers.google.com/mediapipe/solutions/vision/image_segmentation) (for subject masking).
- **Real-Time Communication**: [Ably Realtime](https://ably.com/) (for WebSocket-based remote phone upload).
- **External APIs**: [ImgBB API](https://api.imgbb.com/) (for image hosting and sharing).
- **Utilities**: `qrcode.min.js` (for generating in-browser QR codes) and Python's `http.server` for local development.

## Getting Started

### Prerequisites

- Python 3.x (for running the local development server).
- An active internet connection for fetching CDN libraries and utilizing APIs (MediaPipe, Ably, ImgBB).

### Running Locally

1. Clone or download the repository to your local machine.
2. Double-click the `run_studio.bat` script on Windows.
   - This will start a local HTTP server on port 8000 using Python.
   - It will attempt to detect your local LAN IP address and automatically open the application in your default web browser (`http://localhost:8000`).
   - The terminal will display the URLs for the laptop and the phone pairing.

Alternatively, you can manually start any static file server from the project directory:

```bash
python -m http.server 8000
```

Then navigate to `http://localhost:8000` in your web browser.

### API Configuration

To use the remote uploading and phone sharing features, you will need to provide your own API keys when prompted in the UI:

- **Ably API Key**: Required for pairing your phone with the studio for remote image uploads. You can get a free key at [ably.com](https://ably.com/).
- **ImgBB API Key**: Required for generating QR codes to send the finished artwork to your phone. You can get a free key at [api.imgbb.com](https://api.imgbb.com/).

## How to Use the Studio

1. **Load Your Layers**:
   - **Layer I (Base)**: Upload a portrait or subject photo, or use the built-in webcam to take a selfie.
   - **Layer II (Overlay)**: Upload a nature scene or texture, or select an image from the built-in "Quick Textures" gallery.
2. **Apply AI Masking (Optional)**: Toggle "Subject Masking" to automatically remove the background from your base portrait.
3. **Choose a Style Preset**: Select a pre-configured look like Classic, Forest, Ghost, Noir, Golden, Cosmic, or Dusk.
4. **Fine-Tune Settings**: Use the control sliders to adjust Opacity, Contrast, Brightness, Sepia Tone, Film Grain, Light Leaks, and Halation. You can also manually switch the Blend Mode (e.g., Screen, Multiply, Overlay).
5. **Develop**: Click the "Develop Exposure" button to process and render your creation.
6. **Save & Share**: Use the slider to compare the original and the developed photo. Download the final image locally, or generate a QR code to instantly send it to your smartphone.

## Project Structure

- `index.html`: The main web application interface.
- `remote.html`: The mobile interface for remote image uploading.
- `engine.js`: Core application logic, canvas rendering, AI segmentation, and API integrations.
- `style.css`: Application styling and responsive layout.
- `run_studio.bat`: Windows batch script to easily launch the application locally.
- `qrcode.min.js`: Dependency for generating QR codes in the browser.

## Academic Documentation

Additional academic documentation, including the final project report and presentation slides, are included in this repository:

- `ProjectReport.docx` / `Report.pdf`
- `Graduation_Presentation.pptx`

## Team Members & Acknowledgments

- Developer: Omar Shanaa
- Supervisor: Prof. Dr. Fadi Alturjman
