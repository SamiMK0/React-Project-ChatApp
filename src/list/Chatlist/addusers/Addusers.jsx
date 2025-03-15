import "./addusers.css";
import { arrayUnion, collection, doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where } from "firebase/firestore";
import { useState } from "react";
import { db } from "../../../lib/firebase";
import { useUserStore } from "../../../lib/userStore";

export default function Addusers() {
    const [user, setUser] = useState(null);
    const { currentUser } = useUserStore();

    const handleSearch = async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const username = formData.get("username");

        if (username === currentUser.username) {
            alert("You cannot search for yourself.");
            return;
        }

        try {
            const userRef = collection(db, "users");
            const q = query(userRef, where("username", "==", username));
            const querySnapShot = await getDocs(q);

            if (!querySnapShot.empty) {
                setUser(querySnapShot.docs[0].data());
            } else {
                setUser(null);
                alert("User not found.");
            }
        } catch (err) {
            console.log(err);
        }
    };

    const handleAdd = async () => {
        if (!user) return;

        const chatRef = collection(db, "chats");
        const userChatRef = doc(db, "userchats", currentUser.id);

        try {
            // Fetch current user's chats
            const userChatsSnapshot = await getDoc(userChatRef);
            if (userChatsSnapshot.exists()) {
                const userChatsData = userChatsSnapshot.data().chats || [];

                // Check if the user is already in the chat list
                if (userChatsData.some((chat) => chat.receiverId === user.id)) {
                    alert("User is already in your chat list.");
                    return;
                }
            }

            // Create a new chat
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
                    receiverId: user.id,
                    updatedAt: Date.now()
                }),
            });

            await updateDoc(doc(db, "userchats", user.id), {
                chats: arrayUnion({
                    chatId: newChatRef.id,
                    lastMessage: "",
                    receiverId: currentUser.id,
                    updatedAt: Date.now()
                }),
            });

            alert("User added successfully!");
        } catch (err) {
            console.log(err);
        }
    };

    return (
        <div className="Addusers">
            <form onSubmit={handleSearch}>
                <input type="text" placeholder="Username" name="username" />
                <button>Search</button>
            </form>
            {user && (
                <div className="user">
                    <div className="detail">
                        <img src={user.avatar || "./avatar.png"} alt="" />
                        <span>{user.username}</span>
                    </div>
                    <button onClick={handleAdd}>Add User</button>
                </div>
            )}
        </div>
    );
}
