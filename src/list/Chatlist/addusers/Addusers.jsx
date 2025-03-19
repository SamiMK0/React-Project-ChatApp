import "./addusers.css";
import { arrayUnion, collection, doc, getDoc, getDocs, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { useState } from "react";
import { db } from "../../../lib/firebase";
import { useUserStore } from "../../../lib/userStore";

export default function Addusers() {
    const [users, setUsers] = useState([]); // Changed to hold an array of users
    const [message, setMessage] = useState(""); // New state for feedback message
    const { currentUser } = useUserStore();

    const handleSearch = async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const username = formData.get("username").toLowerCase(); // Normalize to lowercase

        if (username === currentUser.username.toLowerCase()) {
            setMessage("You cannot search for yourself.");
            return;
        }

        try {
            const userRef = collection(db, "users");
            const querySnapshot = await getDocs(userRef); // Fetch all users

            // Filter users based on the search term (e.g., partial match)
            const matchingUsers = querySnapshot.docs.filter((doc) => {
                const userData = doc.data();
                return userData.username.toLowerCase().startsWith(username); // Case-insensitive partial match
            });

            if (matchingUsers.length > 0) {
                // If there are multiple users, set them to the state
                setUsers(matchingUsers.map(doc => doc.data())); // Changed to an array of users
                setMessage(""); // Clear any previous message
            } else {
                setUsers([]);
                setMessage("User not found.");
            }
        } catch (err) {
            console.log(err);
            setMessage("Error occurred while searching. Please try again.");
        }
    };

    const handleAdd = async (userToAdd) => {
        if (!userToAdd) return;
    
        const chatRef = collection(db, "chats");
        const userChatRef = doc(db, "userchats", currentUser.id);
        const targetUserChatRef = doc(db, "userchats", userToAdd.id);
    
        try {
            // Fetch user chat snapshots
            const userChatsSnapshot = await getDoc(userChatRef);
            const targetUserChatsSnapshot = await getDoc(targetUserChatRef);
    
            let existingChat = null;
    
            if (userChatsSnapshot.exists()) {
                existingChat = userChatsSnapshot.data().chats?.find(chat => chat.receiverId === userToAdd.id);
            }
    
            if (existingChat) {
                // Check if the chat still exists in the "chats" collection
                const chatExists = await getDoc(doc(db, "chats", existingChat.chatId));
                if (chatExists.exists()) {
                    setMessage("This user is already in your chat list.");
                    return;
                }
            }
    
            // Create a new chat if none exists
            const newChatRef = doc(chatRef);
            await setDoc(newChatRef, {
                createdAt: serverTimestamp(),
                messages: []
            });
    
            // Update user chat lists
            await updateDoc(userChatRef, {
                chats: arrayUnion({
                    chatId: newChatRef.id,
                    lastMessage: "",
                    receiverId: userToAdd.id,
                    updatedAt: Date.now(),
                    isSeen: true // Ensure new chat is marked as seen
                }),
            });
    
            await updateDoc(targetUserChatRef, {
                chats: arrayUnion({
                    chatId: newChatRef.id,
                    lastMessage: "",
                    receiverId: currentUser.id,
                    updatedAt: Date.now(),
                    isSeen: true
                }),
            });
            
    
            setMessage("User added successfully!");
        } catch (err) {
            console.log(err);
            setMessage("Error occurred while adding the user. Please try again.");
        }
    };
    
    return (
        <div className="Addusers">
            <form onSubmit={handleSearch}>
                <input type="text" placeholder="Username" name="username" />
                <button>Search</button>
            </form>

            {/* Display message feedback */}
            {message && <div className="message-feedback">{message}</div>}

            {/* Render matching users */}
            {users.length > 0 ? (
                <div className="users">
                    {users.map((userItem, index) => (
                        <div key={index} className="user">
                            <div className="detail">
                                <img src={userItem.avatar || "./avatar.png"} alt="" />
                                <span>{userItem.username}</span>
                            </div>
                            <button onClick={() => handleAdd(userItem)}>Add User</button>
                        </div>
                    ))}
                </div>
            ) : (
                <div></div>
            )}
        </div>
    );
}
