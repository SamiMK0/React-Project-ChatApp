import "./userinfo.css";
import { useUserStore } from "../../lib/userStore";
import { useState } from "react";
import { useChatStore } from "../../lib/chatStore";
import { auth } from "../../lib/firebase";

export default function Userinfo() {
    const { currentUser } = useUserStore();
    const [showPopup, setShowPopup] = useState(false);

     const handleLogout = () => {
            useChatStore.getState().resetChat(); 
            useUserStore.getState().resetUser();
        
            setTimeout(() => {
                auth.signOut().catch(err => console.error("Logout Error:", err));
            }, 0);
        };

    return (
        <div className="userinfo">
            <div className="user">
                <img src={currentUser.avatarUrl || "./avatar.png"} alt="" />
                <h2>{currentUser.username}</h2>
            </div>
            <div className="icons">
                <img 
                    src="./more.png" 
                    alt="More options" 
                    className="more-icon" 
                    onClick={() => setShowPopup(prev => !prev)}
                />
                <img src="./video.png" alt="Video call" />
                <img src="./edit.png" alt="Edit profile" />
            </div>

            {showPopup && (
                <div className="popup">
                    <button onClick={() => console.log("Select Chats Clicked")}>Select Chats</button>
                    <button onClick={handleLogout}>Logout</button>
                </div>
            )}
        </div>
    );
}
