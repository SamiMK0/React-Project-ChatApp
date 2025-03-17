import "./chat.css";
import EmojiPicker from "emoji-picker-react";
import { arrayUnion, doc, getDoc, onSnapshot, updateDoc } from "firebase/firestore";
import { useEffect, useRef, useState } from "react";
import { db } from "../lib/firebase";
import { useChatStore } from "../lib/chatStore";
import { useUserStore } from "../lib/userStore";
import uploadToStorj from "../lib/storj";

export default function Chat({ toggleDetails }) {
    const [chat, setChat] = useState();
    const [open, setOpen] = useState(false);
    const [text, setText] = useState("");
    const [img, setImg] = useState({
        file: null,
        url: "",
    });
    const [audio, setAudio] = useState({
        isRecording: false,
        recorder: null,
        stream: null,
        audioBlob: null,
        url: "",
    });
    const [showDetails, setShowDetails] = useState(false); // New state for chat details toggle

    const { chatId, user, isCurrentUserBlocked, isReceiverBlocked } = useChatStore();
    const { currentUser } = useUserStore();
    const endRef = useRef(null);

    useEffect(() => {
        endRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [chat?.messages]);

    useEffect(() => {
        const UnSub = onSnapshot(
            doc(db, "chats", chatId),
            (res) => {
                setChat(res.data());
            });

        return () => {
            UnSub();
        };
    }, [chatId]);

    useEffect(() => {
        setChat(null);
        setText("");
        setImg({ file: null, url: "" });
    }, [chatId, user]);

    useEffect(() => {
        if (!chatId) {
            setChat(null);
            return;
        }

        const fetchChatData = async () => {
            const chatDocRef = doc(db, "chats", chatId);
            const chatDocSnapshot = await getDoc(chatDocRef);
            if (chatDocSnapshot.exists()) {
                setChat(chatDocSnapshot.data());
            }
        };

        fetchChatData();
    }, [chatId]);

    function handleEmoji(e) {
        setText((prev) => prev + e.emoji);
        setOpen(false);
    }

    function handleImg(e) {
        if (e.target.files[0]) {
            setImg({
                file: e.target.files[0],
                url: URL.createObjectURL(e.target.files[0]),
            });
        }
    }

    const formatDate = (timestamp) => {
        const date = new Date(timestamp);
        return date.toLocaleDateString(); // Returns a date string in the format 'MM/DD/YYYY'
    };
    

    const handleSend = async () => {
        if (text === "") return;

        let imgUrl = null;

        try {
            if (img.file) {
                imgUrl = await uploadToStorj(img.file);
            }
            await updateDoc(doc(db, "chats", chatId), {
                messages: arrayUnion({
                    senderId: currentUser.id,
                    text,
                    createdAt: new Date(),
                    ...(imgUrl && { img: imgUrl }),
                }),
            });

            const userIDs = [currentUser.id, user.id];

            userIDs.forEach(async (id) => {
                const userChatsRef = doc(db, "userchats", id);
                const userChatsSnapshot = await getDoc(userChatsRef);

                if (userChatsSnapshot.exists()) {
                    const userChatsData = userChatsSnapshot.data();

                    const chatIndex = userChatsData.chats.findIndex((c) => c.chatId === chatId);

                    userChatsData.chats[chatIndex].lastMessage = text;
                    userChatsData.chats[chatIndex].isSeen = id === currentUser.id ? true : false;
                    userChatsData.chats[chatIndex].updatedAt = Date.now();

                    await updateDoc(userChatsRef, {
                        chats: userChatsData.chats,
                    });
                }
            });
        } catch (err) {
            console.log(err);
        }

        setImg({
            file: null,
            url: "",
        });
        setText("");
    };

    const handleKeyPress = (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            handleSend();
        }
    };

    const startRecording = () => {
        if (audio.isRecording) return;

        setAudio((prevState) => ({ ...prevState, isRecording: true }));

        // Get audio stream
        navigator.mediaDevices.getUserMedia({ audio: true })
            .then((stream) => {
                const mediaRecorder = new MediaRecorder(stream);

                mediaRecorder.ondataavailable = (e) => {
                    setAudio((prevState) => ({
                        ...prevState,
                        audioBlob: e.data,
                        url: URL.createObjectURL(e.data),
                    }));
                };

                mediaRecorder.onstop = () => {
                    // Handle the audio upload (replace with your upload function)
                    uploadAudioToSupabase(audio.audioBlob);
                };

                mediaRecorder.start();
                setAudio((prevState) => ({
                    ...prevState,
                    recorder: mediaRecorder,
                    stream: stream,
                }));
            })
            .catch((err) => {
                console.error("Error accessing microphone:", err);
            });
    };

    const stopRecording = () => {
        if (!audio.isRecording) return;

        // Ensure the mediaRecorder is defined before stopping
        if (audio.recorder && audio.recorder.state === "recording") {
            audio.recorder.stop();
            audio.stream.getTracks().forEach((track) => track.stop()); // Stop the tracks to release the microphone
            setAudio((prevState) => ({ ...prevState, isRecording: false }));
        }
    };

    // Function to upload the audio to Supabase
    const uploadAudioToSupabase = async (audioBlob) => {
        const file = new File([audioBlob], "audio.webm", { type: "audio/webm" });
        const { data, error } = await supabase.storage
            .from("audio-bucket") // Assuming you're storing in a bucket called "audio-bucket"
            .upload("audio-recordings/" + Date.now() + ".webm", file);

        if (error) {
            console.error("Error uploading audio:", error);
            return null;
        }
        return data?.path; // Return the file path or URL
    };

    const formatTime = (timestamp) => {
        const date = new Date(timestamp);
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    return (
        <div className="chat">
            <div className="top">
                <div className="user">
                    <img src={user?.avatar || "./avatar.png"} alt="" />
                    <div className="texts">
                        <span>{user?.username}</span>
                        <p>Lorem ipsum dolor sit, amet?</p>
                    </div>
                </div>
                <div className="icons">
                    <img src="./phone.png" alt="" />
                    <img src="./video.png" alt="" />
                    <img src="./info.png" alt="" onClick={toggleDetails} id="info" />
                </div>
            </div>

            {/* Chat Details Section */}
            {showDetails && (
                <div className="chat-details">
                    <h3>Chat Details</h3>
                    <img src={user?.avatar || "./avatar.png"} alt="User Avatar" />
                    <p><strong>Username:</strong> {user?.username}</p>
                    <p><strong>Email:</strong> {user?.email}</p>
                    <p><strong>Joined:</strong> {new Date(user?.createdAt).toLocaleDateString()}</p>
                    <button onClick={() => setShowDetails(false)}>Close</button>
                </div>
            )}

<div className="center">
    {chat?.messages
        ?.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
        .reduce((acc, message, index, array) => {
            // Format the current message date
            const currentMessageDate = formatDate(message.createdAt.seconds * 1000);
            // Check if the current message's date is different from the previous one
            const prevMessageDate = index > 0 ? formatDate(array[index - 1].createdAt.seconds * 1000) : null;

            // If it's a new date, add the date header
            if (currentMessageDate !== prevMessageDate) {
                acc.push(
                    <div key={`date-${currentMessageDate}`} className="date-header">
                        {currentMessageDate}
                    </div>
                );
            }

            // Add the message itself
            acc.push(
                <div
                    className={message.senderId === currentUser?.id ? "message own" : "message"}
                    key={`${message.senderId}-${message.createdAt}`}
                >
                    <div className="texts">
                        {message.img && <img src={message.img} alt="" />}
                        <p>{message.text}</p>
                        <span className="timestamp">
                            {message.createdAt ?
                                new Date(message.createdAt.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                                : "Invalid date"}
                        </span>
                    </div>
                </div>
            );

            return acc;
        }, [])}
</div>


            <div className="bottom">
                <div className="icons">
                    <label htmlFor="file">
                        <img src="./img.png" alt="" />
                    </label>
                    <input type="file" id="file" style={{ display: "none" }} onChange={handleImg} />
                    <img src="./camera.png" alt="" />
                    <img src="./mic.png" alt="" onClick={audio.isRecording ? stopRecording : startRecording} />
                </div>
                <input
                    type="text"
                    placeholder={isCurrentUserBlocked || isReceiverBlocked ? "You cannot able to send" : "Type a message..."}
                    onChange={(e) => setText(e.target.value)}
                    value={text}
                    disabled={isCurrentUserBlocked || isReceiverBlocked}
                    onKeyPress={handleKeyPress}
                />
                <div className="emoji">
                    <img src="./emoji.png" alt="" onClick={() => setOpen((prev) => !prev)} />
                    <div className="picker">
                        <EmojiPicker open={open} onEmojiClick={handleEmoji} />
                    </div>
                </div>
                <button className="sendButton" onClick={handleSend} disabled={isCurrentUserBlocked || isReceiverBlocked}>
                    Send
                </button>
            </div>
        </div>
    );
}
