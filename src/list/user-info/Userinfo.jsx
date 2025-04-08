import "./userinfo.css";
import { useUserStore } from "../../lib/userStore";
import { useChatStore } from "../../lib/chatStore";
import { auth } from "../../lib/firebase";

export default function Userinfo() {
    const { currentUser } = useUserStore();

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
                
                <button 
                    onClick={handleLogout} 
                    className="logout-icon-button"
                    title="Logout"
                >
                    🔴
                </button>
                <img src="./edit.png" alt="Edit profile" />
                
            </div>
        </div>
    );
}