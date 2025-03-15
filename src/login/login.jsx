import { useState } from "react";
import "./login.css";
import { toast } from "react-toastify";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from "firebase/auth";
import { auth, db } from "../lib/firebase";
import { doc, setDoc } from "firebase/firestore";
import { signOut } from "firebase/auth";
import { collection, query, where, getDocs } from "firebase/firestore";

export default function Login() {
    const [avatar, setAvatar] = useState({
        file: null,
        url: "",
        base64: "" // Store Base64 representation
    });

    const [loading, setLoading] = useState(false);

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
    
        // ✅ Convert username to lowercase for consistent uniqueness check
        username = username.trim().toLowerCase(); 
    
        try {
            // ✅ Check if a case-insensitive username already exists in Firestore
            const q = query(collection(db, "users"), where("usernameLower", "==", username));
            const querySnapshot = await getDocs(q);
    
            if (!querySnapshot.empty) {
                toast.error("Username is already taken. Choose another one.");
                setLoading(false);
                return; // Stop registration if username exists
            }
    
            // ✅ Create user in Firebase Authentication
            const res = await createUserWithEmailAndPassword(auth, email, password);
    
            // ✅ Store user details in Firestore, saving both original and lowercase username
            await setDoc(doc(db, "users", res.user.uid), {
                username,        // Store the original username
                usernameLower: username, // Store the lowercase version for uniqueness checks
                email,
                id: res.user.uid,
                blocked: [],
            });
    
            // ✅ Create user chat document
            await setDoc(doc(db, "userchats", res.user.uid), { chats: [] });
    
            // ✅ Immediately sign out the user after registration
            await signOut(auth);
            toast.success("Account Created! Please sign in to continue.");
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


    return (
        <div className="login">
            <div className="item">
                <h2>Welcome back,</h2>
                <form onSubmit={handleLogin}>
                    <input type="text" placeholder="Email" name="email" />
                    <input type="password" placeholder="Password" name="password" />
                    <button disabled={loading}>{loading ? "Loading" : "Sign In"}</button>
                </form>
            </div>
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
                    <input type="password" placeholder="Password" name="password" />
                    <button disabled={loading}>{loading ? "Loading" : "Sign Up"}</button>
                </form>
            </div>
        </div>
    );
}
