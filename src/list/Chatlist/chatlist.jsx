import Addusers from "./addusers/Addusers";
import "./chatlist.css";
import { useEffect, useState } from "react";
import { useUserStore } from "../../lib/userStore";
import { doc, getDoc, onSnapshot, updateDoc } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useChatStore } from "../../lib/chatStore";

export default function Chatlist() {
    const [Chats, SetChats] = useState([]);
    const [addMode, SetAddMode] = useState(false);
    const [input, SetInput] = useState("");

    const { currentUser } = useUserStore();
    const { chatId, changeChat } = useChatStore();

    useEffect(() => {
        if (!currentUser?.id) return; // Ensure user exists

        const unsub = onSnapshot(doc(db, "userchats", currentUser.id), async (res) => {
            if (!res.exists()) {
                SetChats([]); // Avoid undefined state
                return;
            }

            const items = res.data()?.chats || [];
            
            // Remove duplicate chat IDs
            const uniqueItems = [];
            const chatIds = new Set();

            for (const item of items) {
                if (!chatIds.has(item.chatId)) {
                    chatIds.add(item.chatId);
                    uniqueItems.push(item);
                }
            }

            const promises = uniqueItems.map(async (item) => {
                const userDocRef = doc(db, "users", item.receiverId);
                const userDocSnap = await getDoc(userDocRef);

                return { ...item, user: userDocSnap.exists() ? userDocSnap.data() : null };
            });

            const chatData = await Promise.all(promises);
            SetChats(chatData.sort((a, b) => b.updatedAt - a.updatedAt));
        });

        return () => unsub();
    }, [currentUser?.id]);

    const handleSelect = async (chat) => {
        const userChats = Chats.map((item) => {
            const { user, ...rest } = item;
            return rest;
        });

        const chatIndex = userChats.findIndex((item) => item.chatId === chat.chatId);
        
        // Update the 'isSeen' property to true
        userChats[chatIndex].isSeen = true;

        const userChatsRef = doc(db, "userchats", currentUser.id);

        try {
            await updateDoc(userChatsRef, {
                chats: userChats,
            });

            changeChat(chat.chatId, chat.user);  // Pass both chatId and user for handling the selected chat
        } catch (err) {
            console.log(err);
        }
    };

    const filteredChats = Chats.filter(c => c.user.username.toLowerCase().includes(input.toLowerCase()));

    return (
        <div className="Chatlist">
            <div className="search">
                <div className="searchbar">
                    <img src="./search.png" alt="" />
                    <input 
                        type="text" 
                        placeholder="Search" 
                        onChange={(e) => SetInput(e.target.value)} 
                    />
                </div>
                <img
                    src={addMode ? "./minus.png" : "./plus.png"}
                    alt=""
                    className="add"
                    onClick={() => SetAddMode((prev) => !prev)}
                />
            </div>

            {filteredChats.map((chat) => (
                <div
                    className="item"
                    key={chat.chatId}
                    onClick={() => handleSelect(chat)}
                    style={{
                        backgroundColor: chat?.isSeen ? "transparent" : "#5183fe",
                    }}
                >
                    <img
                        src={chat.user.blocked.includes(currentUser.id) ? "./avatar.png" : chat.user.avatar || "./avatar.png"}
                        alt=""
                    />
                    <div className="texts">
                        <span>
                            {chat.user.blocked.includes(currentUser.id) ? "User" : chat.user.username}
                        </span>
                        <p>{chat.lastMessage}</p>
                    </div>
                </div>
            ))}

            {addMode && <Addusers />}
        </div>
    );
}
