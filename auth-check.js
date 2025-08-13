// This script checks if the user is logged in with Firebase Auth and redirects to login.html if not.
// It must be loaded before any page content that requires authentication.

(function() {
    // Only run auth check if NOT on login.html
    const isLoginPage = /login\.html$/i.test(window.location.pathname);
    if (isLoginPage) {
        document.documentElement.style.visibility = "";
        return;
    }

    // Hide page until auth state is known
    document.documentElement.style.visibility = "hidden";

    function showPage() {
        document.documentElement.style.visibility = "";
    }

    let failTimeout = setTimeout(function() {
        // If after 7 seconds nothing happened, show error or redirect
        document.body.innerHTML = "<div style='color:white;text-align:center;margin-top:20vh;font-size:2rem;'>Unable to load authentication.<br>Please refresh or <a href='login.html' style='color:#f97316;'>login</a> again.</div>";
        showPage();
    }, 7000);

    function doAuthCheck() {
        if (typeof firebase === "undefined" || typeof firebaseConfig === "undefined") {
            // Try again in 50ms until firebase and config are loaded
            setTimeout(doAuthCheck, 50);
            return;
        }
        if (!firebase.apps.length) {
            firebase.initializeApp(firebaseConfig);
        }
        firebase.auth().onAuthStateChanged(function(user) {
            clearTimeout(failTimeout);
            const isMainPage = /main\.html$/i.test(window.location.pathname);
            // FIX: Allow anonymous users on main.html
            if (!user) {
                window.location.replace("login.html");
            } else if (!isMainPage && user.isAnonymous) {
                window.location.replace("login.html");
            } else {
                showPage();
            }
        });
    }

    doAuthCheck();
})();
