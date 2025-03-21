import { useState } from "react";
import "./login.css";
import { toast } from "react-toastify";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail } from "firebase/auth";
import { auth, db } from "../lib/firebase";
import { doc, setDoc } from "firebase/firestore";
import { signOut } from "firebase/auth";
import { collection, query, where, getDocs } from "firebase/firestore";
import { getStorage, ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";

export default function Login() {
    const [avatar, setAvatar] = useState({
        file: null,
        url: "",
        base64: "" // Store Base64 representation
    });
    const [loading, setLoading] = useState(false);
    const [resetEmail, setResetEmail] = useState(""); // State to hold the email for password reset
    const [isResetting, setIsResetting] = useState(false); // Track if we're in the password reset mode
    const [passwordVisibleLogin, setPasswordVisibleLogin] = useState(false); // Toggle for password visibility in login
    const [passwordVisibleRegister, setPasswordVisibleRegister] = useState(false); // Toggle for password visibility in registration

    function handleAvatar(e) {
        if (e.target.files[0]) {
            const file = e.target.files[0];
            const reader = new FileReader();

            reader.onloadend = () => {
                setAvatar({
                    file,
                    url: URL.createObjectURL(file),
                    base64: reader.result // Store Base64 data
                });
            };

            reader.readAsDataURL(file); // Convert to Base64
        }
    }

    const handleRegistration = async (e) => {
        e.preventDefault();
        setLoading(true);
        const formData = new FormData(e.target);
        let { username, email, password } = Object.fromEntries(formData);
    
        username = username.trim().toLowerCase(); // Normalize username
    
        try {
            // Check if username exists
            const q = query(collection(db, "users"), where("usernameLower", "==", username));
            const querySnapshot = await getDocs(q);
    
            if (!querySnapshot.empty) {
                toast.error("Username is already taken. Choose another one.");
                setLoading(false);
                return;
            }
    
            // Create user
            const res = await createUserWithEmailAndPassword(auth, email, password);
            const userId = res.user.uid;
            let avatarUrl = "";
    
            // Upload avatar if selected
            if (avatar.file) {
                const storage = getStorage();
                const avatarRef = ref(storage, `avatars/${userId}`);
                const uploadTask = uploadBytesResumable(avatarRef, avatar.file);
    
                await uploadTask;
                avatarUrl = await getDownloadURL(avatarRef);
            }
    
            // Save user details in Firestore
            await setDoc(doc(db, "users", userId), {
                username,
                usernameLower: username,
                email,
                avatarUrl, // Store avatar URL
                id: userId,
                blocked: [],
            });
    
            // Create user chat document
            await setDoc(doc(db, "userchats", userId), { chats: [] });
            await signOut(auth);
            toast.success("Account Created! Please sign in to continue.");

            e.target.reset();  // Clears the form
            setAvatar({ file: null, url: "", base64: "" }); // Clears avatar
        } catch (err) {
            console.log(err);
            toast.error(err.message);
        } finally {
            setLoading(false);
        }
    };
    
    const handleLogin = async (e) => {
        e.preventDefault();
        setLoading(true);

        const formData = new FormData(e.target);
        const { email, password } = Object.fromEntries(formData);

        try {
            await signInWithEmailAndPassword(auth, email, password);
            toast.success("Logged in successfully!");
        } catch (err) {
            console.log(err);
            toast.error(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleResetPassword = async (e) => {
        e.preventDefault();
        setLoading(true);
        setIsResetting(false); // Close reset form

        try {
            await sendPasswordResetEmail(auth, resetEmail);
            toast.success("Password reset email sent!");
        } catch (err) {
            console.log(err);
            toast.error("Failed to send password reset email.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login">
            <div className="item">
                <h2>Welcome back,</h2>
                <form onSubmit={handleLogin}>
                    <input type="text" placeholder="Email" name="email" />
                    <div className="password-container">
                        <input
                            type={passwordVisibleLogin ? "text" : "password"}
                            placeholder="Password"
                            name="password"
                        />
                        <span
                            className="show-password-icon"
                            onClick={() => setPasswordVisibleLogin(!passwordVisibleLogin)}
                        >
                            {passwordVisibleLogin ? "👁️" : "🙈"}
                        </span>
                    </div>
                    <button disabled={loading}>{loading ? "Loading" : "Sign In"}</button>
                </form>
                <button className="res" onClick={() => setIsResetting(true)} disabled={loading}>
                    Forgot Password?
                </button>
            </div>

            {isResetting && (
                <div className="reset-password">
                    <h2>Reset Your Password</h2>
                    <form onSubmit={handleResetPassword}>
                        <input
                            type="email"
                            placeholder="Enter your email"
                            value={resetEmail}
                            onChange={(e) => setResetEmail(e.target.value)}
                            required
                        />
                        <button disabled={loading}>{loading ? "Sending..." : "Send Reset Email"}</button>
                    </form>
                    <button onClick={() => setIsResetting(false)} disabled={loading}>
                        Cancel
                    </button>
                </div>
            )}

            <div className="separator"></div>
            <div className="item">
                <h2>Create an Account</h2>
                <form onSubmit={handleRegistration}>
                    <label htmlFor="file">
                        <img src={avatar.url || "./avatar.png"} alt="" />
                        Upload an image
                    </label>
                    <input type="file" id="file" style={{ display: "none" }} onChange={handleAvatar} />
                    <input type="text" placeholder="Username" name="username" />
                    <input type="text" placeholder="Email" name="email" />
                    <div className="password-container">
                        <input
                            type={passwordVisibleRegister ? "text" : "password"}
                            placeholder="Password"
                            name="password"
                        />
                        <span
                            className="show-password-icon"
                            onClick={() => setPasswordVisibleRegister(!passwordVisibleRegister)}
                        >
                            {passwordVisibleRegister ? "👁️" : "🙈"}
                        </span>
                    </div>
                    <button disabled={loading}>{loading ? "Loading" : "Sign Up"}</button>
                </form>
            </div>
        </div>
    );
}
