// Initialize Firebase app and auth using global firebase
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const auth = firebase.auth();

//! Providers
const googleProvider = new firebase.auth.GoogleAuthProvider();
const microsoftProvider = new firebase.auth.OAuthProvider('microsoft.com');
const githubProvider = new firebase.auth.GithubAuthProvider();

//! Function to handle social media login with account linking
async function handleSocialMediaLogin(provider) {
    try {
        const result = await auth.signInWithPopup(provider);
        console.log('User logged in:', result.user);
        alert('Login successful!');
        window.location.href = "teacher.html";
    } catch (error) {
        // Microsoft OAuth errors
        if (provider.providerId === 'microsoft.com') {
            // Log the full error object for debugging
            console.error('Full Microsoft OAuth error:', error);
            let errorMsg = "Microsoft login failed.";
            if (error.message) errorMsg += "\n" + error.message;
            if (error.code) errorMsg += "\nError code: " + error.code;
            if (error.customData && error.customData.error) errorMsg += "\nDetails: " + error.customData.error;
            alert(errorMsg + "\nPlease check your Azure app registration, client secret, and redirect URI in both Azure and Firebase.");
            return;
        }
        if (error.code === 'auth/account-exists-with-different-credential') {
            const email = error.email || (error.customData && error.customData.email);
            const pendingCredential = error.credential;
            try {
                const methods = await auth.fetchSignInMethodsForEmail(email);
                // If the provider is available, sign in with it
                if (methods.includes(provider.providerId)) {
                    let providerToUse;
                    if (provider.providerId === 'github.com') providerToUse = githubProvider;
                    else if (provider.providerId === 'microsoft.com') providerToUse = microsoftProvider;
                    else if (provider.providerId === 'google.com') providerToUse = googleProvider;
                    else providerToUse = googleProvider; // fallback
                    const linkedResult = await auth.signInWithPopup(providerToUse);
                    alert('Login successful!');
                    window.location.href = "teacher.html";
                } else {
                    alert(`Please log in using: ${methods.join(', ')} for this email.`);
                }
            } catch (linkError) {
                console.error('Account linking error:', linkError);
                alert(`Login failed: ${linkError.message}`);
            }
        } else {
            console.error('Social media login error:', error);
            alert(`Login failed: ${error.message}`);
        }
    }
}

// Attach social media login functions to window
window.signInWithGoogle = () => handleSocialMediaLogin(googleProvider);
window.signInWithMicrosoft = () => handleSocialMediaLogin(microsoftProvider);
window.signInWithGithub = () => handleSocialMediaLogin(githubProvider);

//!! Login-Register Switcher and Form Handlers
document.addEventListener('DOMContentLoaded', () => {
    const container = document.querySelector('.container');
    const registerBtn = document.querySelector('.register-btn');
    const loginBtn = document.querySelector('.login-btn');
    const loginForm = document.querySelector('.form-box.login');
    const registerForm = document.querySelector('.form-box.register');

    if (registerBtn && container && loginForm && registerForm) {
        registerBtn.addEventListener('click', () => {
            container.classList.add('active');
            loginForm.style.visibility = 'hidden';
            registerForm.style.visibility = 'visible';
        });

        loginBtn.addEventListener('click', () => {
            container.classList.remove('active');
            loginForm.style.visibility = 'visible';
            registerForm.style.visibility = 'hidden';
        });
    }

    // Email Registration/Login
    const registerFormElement = document.querySelector('.form-box.register form');
    const loginFormElement = document.querySelector('.form-box.login form');

    // Email registration
    if (registerFormElement) {
        registerFormElement.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = registerFormElement.querySelector('input[type="email"]').value;
            const password = registerFormElement.querySelector('input[type="password"]').value;

            try {
                const userCredential = await auth.createUserWithEmailAndPassword(email, password);
                console.log('User registered:', userCredential.user);
                alert('Registration successful! Logging you in...');
                localStorage.setItem("cosmicai_login_time", Date.now().toString());
                window.location.href = "teacher.html";
            } catch (error) {
                // Handle disabled email/password provider
                if (error.code === 'auth/operation-not-allowed') {
                    alert("Email/password login is currently disabled for this app. Please enable 'Email/Password' in your Firebase project's Authentication > Sign-in method settings.");
                } else {
                    console.error('Registration error:', error);
                    alert(error.message);
                }
            }
        });
    }

    // Email login
    if (loginFormElement) {
        loginFormElement.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = loginFormElement.querySelector('input[type="text"]').value;
            const password = loginFormElement.querySelector('input[type="password"]').value;

            try {
                const userCredential = await auth.signInWithEmailAndPassword(email, password);
                console.log('User logged in:', userCredential.user);
                alert('Login successful!');
                localStorage.setItem("cosmicai_login_time", Date.now().toString());
                window.location.href = "teacher.html";
            } catch (error) {
                // Handle disabled email/password provider
                if (error.code === 'auth/operation-not-allowed') {
                    alert("Email/password login is currently disabled for this app. Please enable 'Email/Password' in your Firebase project's Authentication > Sign-in method settings.");
                } else {
                    console.error('Login error:', error);
                    alert(error.message);
                }
            }
        });
    }

    // Login/Register panel switcher for new layout
    const loginOuter = document.getElementById('loginOuter');
    const switchBtn = document.getElementById('switchBtn');
    const panelTopTitle = document.getElementById('panelTopTitle');
    const panelTopDesc = document.getElementById('panelTopDesc');
    const loginForm2 = document.getElementById('loginForm');
    const registerForm2 = document.getElementById('registerForm');

    if (switchBtn && panelTopTitle && panelTopDesc && loginForm2 && registerForm2) {
        let isRegister = false;
        switchBtn.onclick = function (e) {
            e.preventDefault();
            isRegister = !isRegister;
            if (isRegister) {
                // Show registration
                panelTopTitle.textContent = "Registration";
                panelTopDesc.textContent = "";
                switchBtn.textContent = "Login";
                loginForm2.style.display = "none";
                registerForm2.style.display = "block";
            } else {
                // Show login
                panelTopTitle.textContent = "Hello, Welcome!";
                panelTopDesc.textContent = "Don't have an account?";
                switchBtn.textContent = "Register";
                loginForm2.style.display = "block";
                registerForm2.style.display = "none";
            }
        };
    }
});


// !! 3D Galaxy Background (Three.js) 
let scene, camera, renderer, stars, starGeo;
function initGalaxyBackground() {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 1000);
    camera.position.z = 1;
    camera.rotation.x = Math.PI / 2;
    renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('galaxyCanvas'), antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x000000, 0);
    starGeo = new THREE.BufferGeometry();
    const positions = [];
    const velocities = [];
    const accelerations = [];
    for (let i = 0; i < 6000; i++) {
        positions.push(
            Math.random() * 600 - 300,
            Math.random() * 600 - 300,
            Math.random() * 600 - 300
        );
        velocities.push(0);
        accelerations.push(0.02);
    }
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    starGeo.setAttribute('velocity', new THREE.Float32BufferAttribute(velocities, 1));
    starGeo.setAttribute('acceleration', new THREE.Float32BufferAttribute(accelerations, 1));
    const starMaterial = new THREE.PointsMaterial({
        color: 0xffffff,
        size: 1.5,
        transparent: true,
        opacity: 0.8,
        map: createStarTexture(),
        blending: THREE.AdditiveBlending
    });
    stars = new THREE.Points(starGeo, starMaterial);
    scene.add(stars);
    window.addEventListener('resize', onWindowResize, false);
}
function createStarTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 16; canvas.height = 16;
    const context = canvas.getContext('2d');
    const gradient = context.createRadialGradient(
        canvas.width / 2,
        canvas.height / 2,
        0,
        canvas.width / 2,
        canvas.height / 2,
        canvas.width / 2
    );
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.2, 'rgba(200,200,200,1)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);
    return new THREE.CanvasTexture(canvas);
}
function animateGalaxy() {
    requestAnimationFrame(animateGalaxy);
    const positions = starGeo.attributes.position.array;
    const velocities = starGeo.attributes.velocity.array;
    const accelerations = starGeo.attributes.acceleration.array;
    for (let i = 0; i < positions.length; i += 3) {
        velocities[i / 3] += accelerations[i / 3];
        positions[i + 2] += velocities[i / 3];
        if (positions[i + 2] > 200) {
            positions[i + 2] = -300;
            velocities[i / 3] = 0;
        }
    }
    starGeo.attributes.position.needsUpdate = true;
    stars.rotation.y += 0.0005;
    renderer.render(scene, camera);
}
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}
document.addEventListener('DOMContentLoaded', () => {
    initGalaxyBackground();
    animateGalaxy();
});
