import "./userinfo.css";
import { useUserStore } from "../../lib/userStore";
import { useChatStore } from "../../lib/chatStore";
import { auth } from "../../lib/firebase";
import { useState, useRef } from "react";
import { uploadBytes, getDownloadURL, ref as storageRef } from "firebase/storage";
import { db, storage } from "../../lib/firebase";
import { doc, updateDoc, arrayUnion, Timestamp } from "firebase/firestore";

export default function Userinfo() {
    const { currentUser } = useUserStore();
    const fileInputRef = useRef(null);
    const [isUploading, setIsUploading] = useState(false);

    const handleLogout = () => {
        useChatStore.getState().resetChat(); 
        useUserStore.getState().resetUser();
    
        setTimeout(() => {
            auth.signOut().catch(err => console.error("Logout Error:", err));
        }, 0);
    };

    const handleAddStory = () => {
        fileInputRef.current.click();
    };

    const handleFileChange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setIsUploading(true);
        
        try {
            // Upload file to Firebase Storage
            const fileRef = storageRef(storage, `stories/${currentUser.id}/${Date.now()}_${file.name}`);
            await uploadBytes(fileRef, file);
            const fileUrl = await getDownloadURL(fileRef);

            // Add story to Firestore with expiration time (24 hours)
            const expiresAt = Timestamp.fromDate(new Date(Date.now() + 24 * 60 * 60 * 1000));
            const userRef = doc(db, "users", currentUser.id);
            
            await updateDoc(userRef, {
                stories: arrayUnion({
                    url: fileUrl,
                    type: file.type.split('/')[0], // 'image', 'video', etc.
                    createdAt: Timestamp.now(),
                    expiresAt,
                    views: []
                })
            });

        } catch (error) {
            console.error("Error uploading story:", error);
        } finally {
            setIsUploading(false);
        }
    };

    return (
        <div className="userinfo">
            <div className="user">
                <img 
                    src={currentUser.avatarUrl || "./avatar.png"} 
                    alt="" 
                    className={`user-avatar ${currentUser.stories?.length > 0 ? 'has-story' : ''}`}
                />
                <h2>{currentUser.username}</h2>
            </div>
            <div className="icons">
            <button 
                    onClick={handleLogout} 
                    className="logout-icon-button"
                    title="Logout"
                >
                    🔴
                </button>
                <button 
                    onClick={handleAddStory}
                    className="add-story-button"
                    disabled={isUploading}
                    title="Add story"
                >
                    {isUploading ? '⏳' : '➕'}
                </button>
                <img src="./edit.png" alt="Edit profile" />
                
                <input 
                    type="file" 
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    accept="image/*,video/*"
                    style={{ display: 'none' }}
                />
            </div>
        </div>
    );
}