let model;
let labels = [];
let imageSize = 224;

const STORAGE_KEY = 'clothsense-demo-user';
const USERS_KEY = 'clothsense-demo-users';

const loginView = document.getElementById('loginView');
const appView = document.getElementById('appView');
const loginForm = document.getElementById('loginForm');
const authSectionLabel = document.getElementById('authSectionLabel');
const authTitle = document.getElementById('authTitle');
const authCopy = document.getElementById('authCopy');
const loginTabButton = document.getElementById('loginTabButton');
const registerTabButton = document.getElementById('registerTabButton');
const emailInput = document.getElementById('emailInput');
const nameGroup = document.getElementById('nameGroup');
const nameInput = document.getElementById('nameInput');
const passwordInput = document.getElementById('passwordInput');
const confirmPasswordGroup = document.getElementById('confirmPasswordGroup');
const confirmPasswordInput = document.getElementById('confirmPasswordInput');
const loginButton = document.getElementById('loginButton');
const loginMessage = document.getElementById('loginMessage');
const logoutButton = document.getElementById('logoutButton');

const imageUpload = document.getElementById('imageUpload');
const startCameraButton = document.getElementById('startCameraButton');
const captureButton = document.getElementById('captureButton');
const retakeButton = document.getElementById('retakeButton');
const cameraPreview = document.getElementById('cameraPreview');
const analyzeButton = document.getElementById('analyzeButton');
const previewImage = document.getElementById('previewImage');
const captureCanvas = document.getElementById('captureCanvas');
const previewPlaceholder = document.getElementById('previewPlaceholder');
const statusText = document.getElementById('status');
const environmentHint = document.getElementById('environmentHint');
const resultCard = document.getElementById('resultCard');
const resultText = document.getElementById('result');
const suggestionText = document.getElementById('suggestion');
const infoText = document.getElementById('info');
const actionButton = document.getElementById('actionButton');
const videoSection = document.getElementById('videoSection');
const videoLinks = document.getElementById('videoLinks');

let authMode = 'login';
let activeImageSource = null;
let cameraStream = null;

const classDetails = {
    Good: {
        suggestion: 'You can donate this cloth.',
        info: 'This cloth looks usable and can be given to someone in need.',
        action: {
            label: 'Find Nearby Donation Centers',
            url: 'https://www.google.com/maps/search/nearby+donation+centers'
        }
    },
    Moderate: {
        suggestion: 'You can upcycle this cloth.',
        info: 'Try reusing it as a bag, mask, pouch, or another simple DIY item.',
        videos: [
            {
                title: 'Turn your old T-shirts into bags',
                url: 'https://www.youtube.com/watch?v=ECOXEp6oUz4'
            },
            {
                title: 'How to make no-sew face masks out of a T-shirt',
                url: 'https://www.youtube.com/watch?v=kpTApHRL080'
            }
        ]
    },
    Bad: {
        suggestion: 'You can recycle this cloth.',
        info: 'The cloth seems too damaged for reuse, so recycling is the best option.'
    },
    'Not Cloth': {
        suggestion: 'This is not a cloth, please upload proper image.',
        info: 'Upload a clear image of a cloth or clothing item for correct prediction.'
    }
};

function normalizeClassName(className) {
    const normalized = className.trim().toUpperCase();

    if (normalized === 'GOOD') return 'Good';
    if (normalized === 'MODERATE') return 'Moderate';
    if (normalized === 'BAD') return 'Bad';
    if (normalized === 'NOT CLOTH') return 'Not Cloth';

    return className.trim();
}

function resetResults() {
    resultCard.hidden = true;
    resultText.textContent = '';
    suggestionText.textContent = '';
    infoText.textContent = '';
    actionButton.hidden = true;
    actionButton.removeAttribute('href');
    actionButton.textContent = '';
    videoSection.hidden = true;
    videoLinks.innerHTML = '';
}

function getStoredUsers() {
    try {
        const storedValue = JSON.parse(localStorage.getItem(USERS_KEY));
        return Array.isArray(storedValue) ? storedValue : [];
    } catch (error) {
        console.error('Failed to read stored users:', error);
        return [];
    }
}

function saveUsers(users) {
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

function setAuthMode(mode) {
    authMode = mode;
    const isRegister = mode === 'register';

    authSectionLabel.textContent = isRegister ? 'Registration' : 'Login';
    authTitle.textContent = isRegister ? 'Create your account' : 'Welcome back';
    authCopy.textContent = isRegister
        ? 'Create a ClothSense account to save your access on this device.'
        : 'Sign in with your ClothSense account to continue.';

    loginTabButton.classList.toggle('active', !isRegister);
    registerTabButton.classList.toggle('active', isRegister);

    nameGroup.hidden = !isRegister;
    confirmPasswordGroup.hidden = !isRegister;

    nameInput.required = isRegister;
    confirmPasswordInput.required = isRegister;

    emailInput.value = emailInput.value.trim();
    passwordInput.value = '';
    confirmPasswordInput.value = '';
    loginMessage.textContent = '';
    loginButton.textContent = isRegister ? 'Create Account' : 'Login';
}

function showAppView() {
    loginView.hidden = true;
    appView.hidden = false;
}

function showLoginView() {
    appView.hidden = true;
    loginView.hidden = false;
}

function syncAuthState() {
    const savedUser = localStorage.getItem(STORAGE_KEY);

    if (savedUser) {
        showAppView();
    } else {
        showLoginView();
    }
}

function resetPreviewState() {
    activeImageSource = null;
    imageUpload.value = '';
    previewImage.hidden = true;
    previewImage.removeAttribute('src');
    cameraPreview.hidden = true;
    previewPlaceholder.hidden = false;
}

function stopCameraStream() {
    if (cameraStream) {
        cameraStream.getTracks().forEach((track) => track.stop());
        cameraStream = null;
    }

    cameraPreview.srcObject = null;
    cameraPreview.hidden = true;
    captureButton.hidden = true;
    retakeButton.hidden = true;
    startCameraButton.hidden = false;
}

function updateEnvironmentHint() {
    if (window.location.protocol === 'file:') {
        environmentHint.hidden = false;
        environmentHint.textContent =
            'Open this app through a local server like Live Server or http://localhost. Loading the model from file:// often fails in browsers.';
    } else {
        environmentHint.hidden = true;
        environmentHint.textContent = '';
    }
}

async function loadMetadata() {
    const response = await fetch('./model/metadata.json');
    if (!response.ok) {
        throw new Error('Metadata could not be loaded.');
    }

    const metadata = await response.json();
    labels = Array.isArray(metadata.labels) ? metadata.labels.map(normalizeClassName) : [];
    imageSize = metadata.imageSize || 224;
}

async function loadModel() {
    statusText.textContent = 'Loading model...';

    try {
        await loadMetadata();
        model = await tf.loadLayersModel('./model/model.json');
        analyzeButton.disabled = false;
        statusText.textContent = 'Model ready. Upload an image to analyze.';
    } catch (error) {
        console.error('Failed to load model:', error);
        analyzeButton.disabled = true;
        statusText.textContent =
            'Model could not be loaded. Please run the app with a local web server and refresh.';
    }
}

function updatePreview() {
    const file = imageUpload.files[0];

    resetResults();
    stopCameraStream();

    if (!file) {
        resetPreviewState();
        statusText.textContent = model
            ? 'Model ready. Upload an image to analyze.'
            : 'Loading model...';
        return;
    }

    activeImageSource = 'upload';
    previewImage.src = URL.createObjectURL(file);
    previewImage.hidden = false;
    cameraPreview.hidden = true;
    previewPlaceholder.hidden = true;
    statusText.textContent = 'Image selected. Ready to analyze.';
}

function buildInputTensor(imageElement) {
    return tf.tidy(() => {
        const pixels = tf.browser.fromPixels(imageElement);
        const resized = tf.image.resizeBilinear(pixels, [imageSize, imageSize]);
        const normalized = resized.toFloat().div(127.5).sub(1);
        return normalized.expandDims(0);
    });
}

function showAction(details) {
    if (details && details.action) {
        actionButton.href = details.action.url;
        actionButton.textContent = details.action.label;
        actionButton.hidden = false;
    } else {
        actionButton.hidden = true;
        actionButton.removeAttribute('href');
        actionButton.textContent = '';
    }
}

function showVideos(details) {
    if (details && Array.isArray(details.videos) && details.videos.length > 0) {
        videoLinks.innerHTML = '';

        details.videos.forEach((video) => {
            const link = document.createElement('a');
            link.href = video.url;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.className = 'video-link';
            link.textContent = video.title;
            videoLinks.appendChild(link);
        });

        videoSection.hidden = false;
    } else {
        videoSection.hidden = true;
        videoLinks.innerHTML = '';
    }
}

async function predict() {
    if (!model) {
        statusText.textContent = 'Model is not ready yet. Please wait and try again.';
        return;
    }

    if (!activeImageSource || previewImage.hidden) {
        statusText.textContent = 'Please upload an image or capture one with the webcam first.';
        return;
    }

    statusText.textContent = 'Analyzing image...';

    try {
        const inputTensor = buildInputTensor(previewImage);
        const outputTensor = model.predict(inputTensor);
        const probabilities = Array.from(await outputTensor.data());

        inputTensor.dispose();
        outputTensor.dispose();

        const topIndex = probabilities.reduce((bestIndex, value, index, values) => {
            return value > values[bestIndex] ? index : bestIndex;
        }, 0);

        const rawClassName = labels[topIndex] || `Class ${topIndex + 1}`;
        const className = normalizeClassName(rawClassName);
        const confidence = probabilities[topIndex] * 100;
        const details = classDetails[className];

        resultText.textContent = `${className} (${confidence.toFixed(2)}%)`;
        suggestionText.textContent = details ? details.suggestion : 'No suggestion available for this prediction.';
        infoText.textContent = details ? details.info : 'The model returned a class that is not mapped in the UI yet.';

        showAction(details);
        showVideos(details);

        resultCard.hidden = false;
        statusText.textContent = 'Analysis complete.';
    } catch (error) {
        console.error('Prediction failed:', error);
        statusText.textContent = 'Prediction failed. Please try another image.';
    }
}

function handleLogin(event) {
    event.preventDefault();

    const name = nameInput.value.trim();
    const email = emailInput.value.trim();
    const password = passwordInput.value.trim();
    const confirmPassword = confirmPasswordInput.value.trim();
    const users = getStoredUsers();
    const existingUser = users.find((user) => user.email.toLowerCase() === email.toLowerCase());

    if (!email || !password) {
        loginMessage.textContent = 'Enter both email and password to continue.';
        return;
    }

    if (authMode === 'register') {
        if (!name) {
            loginMessage.textContent = 'Enter your full name to create an account.';
            return;
        }

        if (password.length < 6) {
            loginMessage.textContent = 'Use at least 6 characters for the password.';
            return;
        }

        if (password !== confirmPassword) {
            loginMessage.textContent = 'Password and confirm password must match.';
            return;
        }

        if (existingUser) {
            loginMessage.textContent = 'An account with this email already exists. Please log in.';
            return;
        }

        users.push({ name, email, password });
        saveUsers(users);
        localStorage.setItem(STORAGE_KEY, email);
        loginMessage.textContent = '';
        showAppView();
        return;
    }

    if (!existingUser || existingUser.password !== password) {
        loginMessage.textContent = 'Invalid email or password. Create an account if you are new here.';
        return;
    }

    localStorage.setItem(STORAGE_KEY, existingUser.email);
    loginMessage.textContent = '';
    showAppView();
}

function handleLogout() {
    localStorage.removeItem(STORAGE_KEY);
    stopCameraStream();
    resetPreviewState();
    resetResults();
    emailInput.value = '';
    nameInput.value = '';
    passwordInput.value = '';
    confirmPasswordInput.value = '';
    setAuthMode('login');
    showLoginView();
}

async function startCamera() {
    resetResults();

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        statusText.textContent = 'Webcam is not supported in this browser.';
        return;
    }

    stopCameraStream();

    try {
        cameraStream = await navigator.mediaDevices.getUserMedia({ video: true });
        cameraPreview.srcObject = cameraStream;
        cameraPreview.hidden = false;
        previewImage.hidden = true;
        previewImage.removeAttribute('src');
        previewPlaceholder.hidden = true;
        activeImageSource = null;
        captureButton.hidden = false;
        retakeButton.hidden = true;
        startCameraButton.hidden = true;
        statusText.textContent = 'Webcam ready. Capture a cloth image to analyze.';
    } catch (error) {
        console.error('Unable to access webcam:', error);
        statusText.textContent = 'Unable to access webcam. Please allow camera permission or upload an image instead.';
        stopCameraStream();
    }
}

function capturePhoto() {
    if (!cameraStream || !cameraPreview.videoWidth || !cameraPreview.videoHeight) {
        statusText.textContent = 'Webcam is not ready yet. Please wait a moment and try again.';
        return;
    }

    const context = captureCanvas.getContext('2d');
    captureCanvas.width = cameraPreview.videoWidth;
    captureCanvas.height = cameraPreview.videoHeight;
    context.drawImage(cameraPreview, 0, 0, captureCanvas.width, captureCanvas.height);

    previewImage.src = captureCanvas.toDataURL('image/png');
    previewImage.hidden = false;
    cameraPreview.hidden = true;
    cameraPreview.srcObject = null;
    activeImageSource = 'camera';

    cameraStream.getTracks().forEach((track) => track.stop());
    cameraStream = null;

    startCameraButton.hidden = true;
    captureButton.hidden = true;
    retakeButton.hidden = false;
    statusText.textContent = 'Photo captured. Ready to analyze.';
}

async function retakePhoto() {
    await startCamera();
}

loginForm.addEventListener('submit', handleLogin);
loginTabButton.addEventListener('click', () => setAuthMode('login'));
registerTabButton.addEventListener('click', () => setAuthMode('register'));
logoutButton.addEventListener('click', handleLogout);
imageUpload.addEventListener('change', updatePreview);
startCameraButton.addEventListener('click', startCamera);
captureButton.addEventListener('click', capturePhoto);
retakeButton.addEventListener('click', retakePhoto);
analyzeButton.addEventListener('click', predict);
window.addEventListener('beforeunload', stopCameraStream);

setAuthMode('login');
syncAuthState();
updateEnvironmentHint();
loadModel();
