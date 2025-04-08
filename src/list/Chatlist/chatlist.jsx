import { useState, useEffect } from "react";
import { deleteDoc, doc, getDoc, onSnapshot, updateDoc } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useUserStore } from "../../lib/userStore";
import { useChatStore } from "../../lib/chatStore";
import Addusers from "./addusers/Addusers";
import "./chatlist.css";
import StoryModal from "./StoryModal";

export default function Chatlist() {
    const [Chats, SetChats] = useState([]);
    const [addMode, SetAddMode] = useState(false);
    const [input, SetInput] = useState("");
    const [dropdownOpen, setDropdownOpen] = useState(null); // Track which chat's dropdown is open
    const [activeArrow, setActiveArrow] = useState(null); // Track which chat's arrow is clicked


    const [selectedStoryUser, setSelectedStoryUser] = useState(null);
    const [currentStoryIndex, setCurrentStoryIndex] = useState(0);


    const { currentUser } = useUserStore();
    const { chatId, changeChat } = useChatStore();

    useEffect(() => {
        if (!currentUser?.id) return;

        const unsub = onSnapshot(doc(db, "userchats", currentUser.id), async (res) => {
            if (!res.exists()) {
                SetChats([]);
                return;
            }

            const items = res.data()?.chats || [];
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

        userChats[chatIndex].isSeen = true;

        const userChatsRef = doc(db, "userchats", currentUser.id);

        try {
            await updateDoc(userChatsRef, { chats: userChats });
            changeChat(chat.chatId, chat.user);
        } catch (err) {
            console.log(err);
        }
    };

    const handleDeleteChat = async (chatIdToDelete) => {
        if (!currentUser?.id) return;
    
        // Remove chat from the user's userchats collection
        const userChatsRef = doc(db, "userchats", currentUser.id);
        
        // Remove chat from UI
        const updatedChats = Chats.filter((chat) => chat.chatId !== chatIdToDelete);
        SetChats(updatedChats);
    
        try {
            // Get current user's chat list and update it
            const userChatsSnap = await getDoc(userChatsRef);
            if (userChatsSnap.exists()) {
                const userChats = userChatsSnap.data().chats || [];
                const newChats = userChats.filter(chat => chat.chatId !== chatIdToDelete);
    
                await updateDoc(userChatsRef, { chats: newChats });
            }
    
            // Get receiver's ID (to also remove the chat from their list)
            const chatToDelete = Chats.find(chat => chat.chatId === chatIdToDelete);
            if (!chatToDelete) return;
            
            const receiverId = chatToDelete.receiverId;
            if (receiverId) {
                const receiverChatsRef = doc(db, "userchats", receiverId);
                const receiverChatsSnap = await getDoc(receiverChatsRef);
    
                if (receiverChatsSnap.exists()) {
                    const receiverChats = receiverChatsSnap.data().chats || [];
                    const newReceiverChats = receiverChats.filter(chat => chat.chatId !== chatIdToDelete);
    
                    await updateDoc(receiverChatsRef, { chats: newReceiverChats });
                }
            }
    
            // Delete the actual chat document from the "chats" collection
            const chatDocRef = doc(db, "chats", chatIdToDelete);
            await deleteDoc(chatDocRef);
    
        } catch (err) {
            console.log("Error deleting chat:", err);
        }
    };

    const filteredChats = Chats.filter((c) =>
        c.user.username.toLowerCase().includes(input.toLowerCase())
    );


    

    // story code

    const handleStoryClick = (user) => {
        if (user.stories?.length > 0) {
            setSelectedStoryUser(user);
            setCurrentStoryIndex(0);
        }
    };

    const closeStoryModal = () => {
        setSelectedStoryUser(null);
    };

    const goToNextStory = () => {
        if (selectedStoryUser && currentStoryIndex < selectedStoryUser.stories.length - 1) {
            setCurrentStoryIndex(currentStoryIndex + 1);
        } else {
            closeStoryModal();
        }
    };
    const goToPrevStory = () => {
        if (currentStoryIndex > 0) {
            setCurrentStoryIndex(currentStoryIndex - 1);
        }
    };

    // Filter out expired stories
    const filterActiveStories = (user) => {
        if (!user.stories) return user;
        const now = new Date();
        return {
            ...user,
            stories: user.stories.filter(story => 
                story.expiresAt?.toDate() > now
            )
        };
    };



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
    
            {filteredChats.map((chat) => {
                const userWithStories = filterActiveStories(chat.user);
                const hasStories = userWithStories.stories?.length > 0;
    
                return (
                    <div
                        className="item"
                        key={chat.chatId}
                        onMouseEnter={() => setDropdownOpen(chat.chatId)}
                        onMouseLeave={() => setDropdownOpen(null)}
                        onClick={() => handleSelect(chat)}
                        style={{
                            backgroundColor: chat.chatId === chatId ? "#a39998" : chat.isSeen ? "transparent" : "#2a2a2a",
                            borderLeft: chat.isSeen ? "none" : "5px solid red",
                            position: "relative",
                        }}
                    >
                        <div className="avatar-container" onClick={(e) => {
                            e.stopPropagation();
                            handleStoryClick(userWithStories);
                        }}>
                            <img
                                src={userWithStories.blocked.includes(currentUser.id) ? "./avatar.png" : userWithStories.avatarUrl || "./avatar.png"}
                                alt=""
                                className={`user-avatar ${hasStories ? 'has-story' : ''}`}
                            />
                            {hasStories && <div className="story-indicator"></div>}
                        </div>
                        <div className="texts">
                            <span style={{ color: "white", fontWeight: chat.isSeen ? "normal" : "bold" }}>
                                {userWithStories?.blocked?.includes(currentUser.id) ? "User" : userWithStories?.username}
                            </span>
                            <p style={{ fontWeight: chat.isSeen ? "normal" : "bold", color: chat.isSeen ? "#ccc" : "#fff" }}>
                                {chat.lastMessage}
                            </p>
                        </div>
    
                        {!chat.isSeen && <div className="unread-dot"></div>}
    
                        <div
                            className="arrow-icon"
                            onClick={(e) => {
                                e.stopPropagation();
                                setActiveArrow(activeArrow === chat.chatId ? null : chat.chatId);
                            }}
                        >
                            &#8595;
                        </div>
    
                        {activeArrow === chat.chatId && (
                            <div className="dropdown">
                                <button onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteChat(chat.chatId);
                                }}>
                                    Delete
                                </button>
                            </div>
                        )}
                    </div>
                );
            })}
    
            {addMode && <Addusers />}
    
            {selectedStoryUser && (
                <StoryModal
                    user={selectedStoryUser}
                    currentIndex={currentStoryIndex}
                    onClose={closeStoryModal}
                    onNext={goToNextStory}
                    onPrev={goToPrevStory}
                    currentUserId={currentUser.id}
                />
            )}
        </div>
    );
}
