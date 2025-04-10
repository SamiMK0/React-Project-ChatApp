import "./chat.css";
import EmojiPicker from "emoji-picker-react";
import { arrayUnion, doc, getDoc, onSnapshot, updateDoc } from "firebase/firestore";
import { useEffect, useRef, useState } from "react";
import { db } from "../lib/firebase";
import { useChatStore } from "../lib/chatStore";
import { useUserStore } from "../lib/userStore";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";


import useVoiceCall from "./useVoiceCall";

export default function Chat({ toggleDetails }) {
    const [chat, setChat] = useState();
    const [open, setOpen] = useState(false);
    const [text, setText] = useState("");
    const [img, setImg] = useState({
        file: null,
        url: "",
    });
    const [showPreview, setShowPreview] = useState(false);

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
    const otherUserId = user?.id;
    const {
        callStatus,
        startCall,
        answerCall,
        endCall,
        localStream,
        remoteStream
    } = useVoiceCall(currentUser?.id, otherUserId);

    // Audio refs
    const localAudioRef = useRef(null);
    const remoteAudioRef = useRef(null);

    // Update audio streams when they change
    useEffect(() => {
        if (localStream && localAudioRef.current) {
            localAudioRef.current.srcObject = localStream;
        }
    }, [localStream]);

    useEffect(() => {
        if (remoteStream && remoteAudioRef.current) {
            remoteAudioRef.current.srcObject = remoteStream;
        }
    }, [remoteStream]);




    const endRef = useRef(null);
    const [menuOpen, setMenuOpen] = useState(null);

    const toggleMenu = (messageId) => {
        setMenuOpen(menuOpen === messageId ? null : messageId);
    };

    const deleteMessage = async (messageId) => {
        try {
            if (!chatId || !messageId) return;

            // Filter out the deleted message
            const updatedMessages = chat.messages.filter(
                (msg) => msg.createdAt.seconds !== messageId.seconds
            );

            // Update the chat messages in Firestore
            await updateDoc(doc(db, "chats", chatId), {
                messages: updatedMessages,
            });

            // Update userchats for both users
            const updateLastMessageForUser = async (userId) => {
                const userChatsRef = doc(db, "userchats", userId);
                const userChatsSnap = await getDoc(userChatsRef);
                if (userChatsSnap.exists()) {
                    const userChatsData = userChatsSnap.data();
                    const chatIndex = userChatsData.chats.findIndex((c) => c.chatId === chatId);
                    if (chatIndex !== -1) {
                        const newLastMessage = updatedMessages.length > 0
                            ? updatedMessages[updatedMessages.length - 1]
                            : null;

                        userChatsData.chats[chatIndex].lastMessage = newLastMessage?.text
                            || (newLastMessage?.img && "📷 Image")
                            || (newLastMessage?.audioUrl && "🎤 Voice Message")
                            || "";

                        userChatsData.chats[chatIndex].updatedAt = Date.now();

                        await updateDoc(userChatsRef, {
                            chats: userChatsData.chats,
                        });
                    }
                }
            };

            // Update both users
            await Promise.all([
                updateLastMessageForUser(currentUser.id),
                updateLastMessageForUser(user.id),
            ]);

            // Update state
            setChat((prevChat) => ({
                ...prevChat,
                messages: updatedMessages,
            }));

            setMenuOpen(null);
        } catch (error) {
            console.error("Error deleting message:", error);
        }
    };


    useEffect(() => {
        if (endRef.current) {
            endRef.current.scrollIntoView({ behavior: "smooth" });
        }
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
            setShowPreview(true); // Show preview modal
        }
    }



    const formatDate = (timestamp) => {
        if (!timestamp) return "Invalid Date";

        let date;
        if (timestamp.seconds) {
            date = new Date(timestamp.seconds * 1000);
        } else {
            date = new Date(timestamp);
        }

        return date.toLocaleDateString();
    };


    const startRecording = () => {
        if (audio.isRecording) return;

        navigator.mediaDevices.getUserMedia({ audio: true })
            .then((stream) => {
                const mediaRecorder = new MediaRecorder(stream);
                const audioChunks = [];

                mediaRecorder.ondataavailable = (event) => {
                    if (event.data.size > 0) {
                        audioChunks.push(event.data);
                    }
                };

                mediaRecorder.onstop = async () => {
                    const audioBlob = new Blob(audioChunks, { type: "audio/webm" });
                    setAudio({
                        isRecording: false,
                        recorder: null,
                        stream: null,
                        audioBlob: audioBlob,
                        url: URL.createObjectURL(audioBlob),
                    });

                    await sendAudioMessage(audioBlob); // Upload and send message
                };


                mediaRecorder.start();
                setAudio({ isRecording: true, recorder: mediaRecorder, stream: stream });
            })
            .catch((err) => console.error("Error accessing microphone:", err));
    };

    const stopRecording = () => {
        if (!audio.isRecording || !audio.recorder) return;

        audio.recorder.stop();
        audio.stream.getTracks().forEach(track => track.stop()); // Release the microphone
    };

    const sendAudioMessage = async (audioBlob) => {
        try {
            const storage = getStorage();
            const audioFile = new File([audioBlob], `audio_${Date.now()}.webm`, { type: "audio/webm" });
            const audioRef = ref(storage, `audio/${audioFile.name}`);

            // Upload audio file to Firebase Storage
            await uploadBytes(audioRef, audioFile);
            const audioUrl = await getDownloadURL(audioRef); // Get the download URL

            // Save the audio URL to Firestore chat messages
            await updateDoc(doc(db, "chats", chatId), {
                messages: arrayUnion({
                    senderId: currentUser.id,
                    audioUrl: audioUrl,
                    createdAt: new Date(),
                }),
            });

            // Update last message in userchats collection
            const userIDs = [currentUser.id, user.id];

            userIDs.forEach(async (id) => {
                const userChatsRef = doc(db, "userchats", id);
                const userChatsSnapshot = await getDoc(userChatsRef);

                if (userChatsSnapshot.exists()) {
                    const userChatsData = userChatsSnapshot.data();

                    const chatIndex = userChatsData.chats.findIndex((c) => c.chatId === chatId);

                    if (chatIndex !== -1) {
                        userChatsData.chats[chatIndex].lastMessage = "🎤 Voice Message"; // Placeholder for voice
                        userChatsData.chats[chatIndex].isSeen = id === currentUser.id ? true : false;
                        userChatsData.chats[chatIndex].updatedAt = Date.now();

                        await updateDoc(userChatsRef, {
                            chats: userChatsData.chats,
                        });
                    }
                }
            });

        } catch (err) {
            console.error("Error sending audio message:", err);
        }
    };

    const handleSend = async () => {
        if (text === "" && !img.file) return;

        let imgUrl = null;

        try {
            if (img.file) {
                const storage = getStorage();
                const imgRef = ref(storage, `images/${Date.now()}_${img.file.name}`);
                await uploadBytes(imgRef, img.file);
                imgUrl = await getDownloadURL(imgRef);
            }

            // Send message with isSeen: false initially
            await updateDoc(doc(db, "chats", chatId), {
                messages: arrayUnion({
                    senderId: currentUser.id,
                    text,
                    createdAt: new Date(),
                    isSeen: false, // Add this line
                    ...(imgUrl && { img: imgUrl }),
                }),
            });

            // Update last message in user chats
            const userIDs = [currentUser.id, user.id];
            userIDs.forEach(async (id) => {
                const userChatsRef = doc(db, "userchats", id);
                const userChatsSnapshot = await getDoc(userChatsRef);

                if (userChatsSnapshot.exists()) {
                    const userChatsData = userChatsSnapshot.data();
                    const chatIndex = userChatsData.chats.findIndex((c) => c.chatId === chatId);

                    if (chatIndex !== -1) {
                        userChatsData.chats[chatIndex].lastMessage = text || "📷 Image";
                        userChatsData.chats[chatIndex].isSeen = id === currentUser.id;
                        userChatsData.chats[chatIndex].updatedAt = Date.now();
                        await updateDoc(userChatsRef, { chats: userChatsData.chats });
                    }
                }
            });
        } catch (err) {
            console.error("Error sending message:", err);
        }

        setImg({ file: null, url: "" });
        setText("");
    };

    const handleKeyPress = (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            handleSend();
        }
    };

    const formatTime = (timestamp) => {
        if (!timestamp) return "Invalid Date"; // Handle undefined/null cases

        let date;
        if (timestamp.seconds) {
            date = new Date(timestamp.seconds * 1000); // Firestore timestamp format
        } else {
            date = new Date(timestamp); // Fallback for regular timestamps
        }

        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };


    // Add this function to your component
    const handleDownload = async (storageUrl) => {
        try {
            // Extract the path from the full URL
            const path = new URL(storageUrl).pathname;
            const storagePath = path.split('/o/')[1].split('?')[0];

            const storage = getStorage();
            const fileRef = ref(storage, decodeURIComponent(storagePath));

            // Get download URL
            const url = await getDownloadURL(fileRef);

            // Create temporary link
            const link = document.createElement('a');
            link.href = url;
            link.download = `image_${Date.now()}.jpg`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } catch (error) {
            console.error('Download failed:', error);
        }
    };


    const [showCamera, setShowCamera] = useState(false);
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const [stream, setStream] = useState(null);
    const [isCameraReady, setIsCameraReady] = useState(false);
    const [cameraError, setCameraError] = useState(null);
    const [isInitializing, setIsInitializing] = useState(false);


    const openCamera = async () => {
        setCameraError(null);
        setIsInitializing(true);
        setShowCamera(true); // Show the camera UI immediately

        try {
            // Stop any existing stream first
            if (stream) {
                stream.getTracks().forEach(track => track.stop());
            }

            const constraints = {
                video: {
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                    facingMode: 'user' // Prioritize front camera
                },
                audio: false
            };

            const newStream = await navigator.mediaDevices.getUserMedia(constraints);
            setStream(newStream);

            // Wait for the video element to be available in the DOM
            await new Promise(resolve => {
                const checkVideo = () => {
                    if (videoRef.current) {
                        resolve();
                    } else {
                        setTimeout(checkVideo, 50);
                    }
                };
                checkVideo();
            });

            const video = videoRef.current;
            video.srcObject = newStream;

            // Use both events for better reliability
            const onCanPlay = () => {
                video.removeEventListener('canplay', onCanPlay);
                setIsCameraReady(true);
                setIsInitializing(false);
            };

            const onError = () => {
                video.removeEventListener('error', onError);
                setCameraError("Video playback error");
                setIsInitializing(false);
            };

            video.addEventListener('canplay', onCanPlay);
            video.addEventListener('error', onError);

            // Start playing the video
            await video.play().catch(err => {
                console.error("Play error:", err);
                setCameraError("Couldn't start video playback");
                setIsInitializing(false);
            });

        } catch (err) {
            console.error("Camera error:", err);
            setCameraError(err.message || "Couldn't access camera");
            setIsInitializing(false);
        }
    };

    const captureScreenshot = () => {
        if (!isCameraReady) {
            alert("Camera is not ready yet. Please wait a moment.");
            return;
        }

        try {
            const video = videoRef.current;
            const canvas = canvasRef.current;

            if (!video || !canvas) {
                throw new Error("Video or canvas elements not found");
            }

            // Double-check video is actually playing
            if (video.paused || video.readyState < HTMLMediaElement.HAVE_ENOUGH_DATA) {
                throw new Error("Video stream not ready for capture");
            }

            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const context = canvas.getContext("2d");
            context.drawImage(video, 0, 0, canvas.width, canvas.height);

            canvas.toBlob((blob) => {
                if (!blob) {
                    throw new Error("Failed to create image blob");
                }

                const file = new File([blob], `photo_${Date.now()}.png`, {
                    type: "image/png",
                    lastModified: Date.now()
                });

                setImg({
                    file: file,
                    url: URL.createObjectURL(file),
                });

                closeCamera();
            }, 'image/png', 0.95);
        } catch (error) {
            console.error("Capture error:", error);
            alert("Failed to capture photo: " + error.message);
        }
    };

    const closeCamera = () => {
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
            setStream(null);
        }
        setShowCamera(false);
    };

    // Clean up camera on unmount
    useEffect(() => {
        return () => {
            if (stream) {
                stream.getTracks().forEach(track => track.stop());
            }
        };
    }, [stream]);



    function isValidImage(url) {
        // Check if the file has a valid image extension
        const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'webp'];
        const extension = url.split('.').pop().toLowerCase().split('?')[0]; // Handle URLs with query params
        return imageExtensions.includes(extension);
    }

    function extractFileName(url) {
        try {
            // Decode URI and get the last part after /
            const decoded = decodeURIComponent(url);
            let fileName = decoded.split('/').pop().split('?')[0];

            // Remove timestamp prefix if it exists (format: 123456789_filename.ext)
            const timestampRegex = /^\d+_/;
            if (timestampRegex.test(fileName)) {
                fileName = fileName.replace(timestampRegex, '');
            }

            return fileName;
        } catch (e) {
            return url.split('/').pop().split('?')[0];
        }
    }

    useEffect(() => {
        if (!chatId || !currentUser?.id) return;

        const markMessagesAsSeen = async () => {
            try {
                const chatRef = doc(db, "chats", chatId);
                const chatSnap = await getDoc(chatRef);

                if (chatSnap.exists()) {
                    const messages = chatSnap.data().messages || [];
                    const unseenMessages = messages.filter(
                        msg => msg.senderId !== currentUser.id && !msg.isSeen
                    );

                    if (unseenMessages.length > 0) {
                        // Update all unseen messages
                        const updatedMessages = messages.map(msg => {
                            if (msg.senderId !== currentUser.id && !msg.isSeen) {
                                return { ...msg, isSeen: true };
                            }
                            return msg;
                        });

                        await updateDoc(chatRef, { messages: updatedMessages });

                        // Update userchats to reflect seen status
                        const userChatsRef = doc(db, "userchats", currentUser.id);
                        const userChatsSnap = await getDoc(userChatsRef);

                        if (userChatsSnap.exists()) {
                            const userChatsData = userChatsSnap.data();
                            const chatIndex = userChatsData.chats.findIndex(c => c.chatId === chatId);

                            if (chatIndex !== -1) {
                                userChatsData.chats[chatIndex].isSeen = true;
                                await updateDoc(userChatsRef, { chats: userChatsData.chats });
                            }
                        }
                    }
                }
            } catch (error) {
                console.error("Error marking messages as seen:", error);
            }
        };

        // Run when chat changes or component mounts
        markMessagesAsSeen();
    }, [chat?.messages, chatId, currentUser?.id]);



    const [searchQuery, setSearchQuery] = useState("");
    const [searchResults, setSearchResults] = useState([]);
    const [highlightedMessageId, setHighlightedMessageId] = useState(null);
    const [currentHighlightIndex, setCurrentHighlightIndex] = useState(0);

    const handleSearch = () => {
        if (!chat?.messages || !searchQuery.trim()) {
            setSearchResults([]);
            setHighlightedMessageId(null);
            setCurrentHighlightIndex(0);
            return;
        }

        const results = chat.messages
            .filter(message =>
                message.text?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                (message.img && "image".includes(searchQuery.toLowerCase())) ||
                (message.audioUrl && "voice message".includes(searchQuery.toLowerCase()))
            )
            .map(message => ({
                ...message,
                searchMatch: message.text?.toLowerCase().includes(searchQuery.toLowerCase())
                    ? message.text
                    : message.img ? "Image" : "Voice message"
            }));

        setSearchResults(results);
        setCurrentHighlightIndex(0);

        if (results.length > 0) {
            highlightMessage(results[0].createdAt.seconds);
        }
    };

    const highlightMessage = (messageId) => {
        setHighlightedMessageId(messageId);

        // Remove previous highlights
        document.querySelectorAll('.message.highlighted').forEach(el => {
            el.classList.remove('highlighted');
        });

        const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
        if (messageElement) {
            messageElement.scrollIntoView({ behavior: "smooth", block: "center" });
            messageElement.classList.add("highlighted");

            // Remove highlight after 3 seconds
            setTimeout(() => {
                messageElement.classList.remove("highlighted");
            }, 3000);
        }
    };

    const navigateResults = (direction) => {
        if (searchResults.length === 0) return;

        let newIndex = currentHighlightIndex + direction;
        if (newIndex < 0) newIndex = searchResults.length - 1;
        if (newIndex >= searchResults.length) newIndex = 0;

        setCurrentHighlightIndex(newIndex);
        highlightMessage(searchResults[newIndex].createdAt.seconds);
    };

    // Add a debounced search function for dynamic searching
    useEffect(() => {
        const timer = setTimeout(() => {
            if (searchQuery.trim()) {
                handleSearch();
            } else {
                setSearchResults([]);
            }
        }, 300); // 300ms debounce delay

        return () => clearTimeout(timer);
    }, [searchQuery, chat?.messages]);


    // Add this state near your other state declarations
    const [emojiPickerForMessage, setEmojiPickerForMessage] = useState(null);


    // Add this function to handle adding reactions
    const addReaction = async (messageId, emoji) => {
        try {
            if (!chatId || !messageId) return;

            const chatRef = doc(db, "chats", chatId);
            const chatSnap = await getDoc(chatRef);

            if (chatSnap.exists()) {
                const messages = chatSnap.data().messages || [];
                const updatedMessages = messages.map(msg => {
                    if (msg.createdAt.seconds === messageId.seconds) {
                        // Initialize reactions if not exists
                        const reactions = msg.reactions || {};

                        // Toggle reaction - if user already reacted with this emoji, remove it
                        if (reactions[currentUser.id] === emoji) {
                            delete reactions[currentUser.id];
                        } else {
                            reactions[currentUser.id] = emoji;
                        }

                        return {
                            ...msg,
                            reactions: reactions
                        };
                    }
                    return msg;
                });

                await updateDoc(chatRef, {
                    messages: updatedMessages
                });

                setChat(prev => ({
                    ...prev,
                    messages: updatedMessages
                }));
            }
        } catch (error) {
            console.error("Error adding reaction:", error);
        }
    };

    return (
        <div className="chat">
            <div className="top">
                <div className="user">
                    <img src={user?.avatarUrl || "./avatar.png"} alt="" />
                    <div className="texts">
                        <span>{user?.username}</span>
                        <p>{user?.bio || "No bio available"}</p>
                    </div>
                </div>
                <div className="icons">

                    <div className="search-container">
                        <input
                            type="text"
                            placeholder="Search messages..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                        />
                        <button onClick={handleSearch}>🔍</button>

                        {searchResults.length > 0 && (
                            <div className="search-navigation">
                                <span>
                                    {currentHighlightIndex + 1}/{searchResults.length}
                                </span>
                                <button onClick={() => navigateResults(-1)}>⬆</button>
                                <button onClick={() => navigateResults(1)}>⬇</button>
                            </div>
                        )}
                    </div>

                    <div className="call-controls">
                        <button
                            onClick={startCall}
                            disabled={callStatus !== 'idle' || !otherUserId}
                            title="Start voice call"
                        >
                            <img src="./phone.png" alt="Call" />
                        </button>

                        {callStatus === 'ringing' && (
                            <div className="incoming-call">
                                <p>Incoming call from {user?.username}</p>
                                <button onClick={answerCall} className="accept-call">
                                    Answer
                                </button>
                                <button onClick={endCall} className="decline-call">
                                    Decline
                                </button>
                            </div>
                        )}

                        {['calling', 'ongoing'].includes(callStatus) && (
                            <div className="active-call">
                                <p>
                                    {callStatus === 'calling' ? 'Calling...' : 'Call in progress'}
                                </p>
                                <button onClick={endCall} className="end-call">
                                    End Call
                                </button>
                            </div>
                        )}

                        <audio ref={localAudioRef} muted autoPlay playsInline />
                        <audio ref={remoteAudioRef} autoPlay playsInline />
                    </div>




                    <img src="./video.png" alt="" />
                    <img src="./info.png" alt="" onClick={toggleDetails} id="info" />
                </div>

            </div>

            {searchQuery && (
                <div className="search-results">
                    {searchResults.length > 0 ? (
                        searchResults.map((message, index) => (
                            <div
                                key={message.createdAt.seconds}
                                className={`search-result-item ${index === currentHighlightIndex ? 'active' : ''}`}
                                onClick={() => {
                                    setCurrentHighlightIndex(index);
                                    highlightMessage(message.createdAt.seconds);
                                }}
                            >
                                <p>
                                    {message.searchMatch === "Image" ? (
                                        <span>📷 Image</span>
                                    ) : message.searchMatch === "Voice message" ? (
                                        <span>🎤 Voice message</span>
                                    ) : (
                                        <>
                                            {message.searchMatch.split(new RegExp(`(${searchQuery})`, 'gi')).map((part, i) => (
                                                part.toLowerCase() === searchQuery.toLowerCase() ? (
                                                    <span key={i} className="highlight-text">{part}</span>
                                                ) : (
                                                    <span key={i}>{part}</span>
                                                )
                                            ))}
                                        </>
                                    )}
                                </p>
                                <span className="search-result-time">
                                    {formatTime(message.createdAt)}
                                </span>
                            </div>
                        ))
                    ) : (
                        <div className="search-no-results">
                            No messages found for "{searchQuery}"
                        </div>
                    )}
                </div>
            )}


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
                        const currentMessageDate = formatDate(message.createdAt.seconds * 1000);
                        const prevMessageDate = index > 0 ? formatDate(array[index - 1].createdAt.seconds * 1000) : null;

                        if (currentMessageDate !== prevMessageDate) {
                            acc.push(
                                <div key={`date-${currentMessageDate}`} className="date-header">
                                    {currentMessageDate}
                                </div>
                            );
                        }

                        acc.push(
                            <div className={`message ${message.senderId === currentUser?.id ? "own" : ""}`} key={message.createdAt}
                                data-message-id={message.createdAt.seconds}
                            >
                                <div className="texts">

                                    {message.img && (
                                        <div className="message-image-container">
                                            {isValidImage(message.img) ? (
                                                // Display image with error handling
                                                <>
                                                    <img
                                                        src={message.img}
                                                        alt=""
                                                        className="sent-image"
                                                        onError={(e) => {
                                                            e.target.onerror = null;
                                                            e.target.src = './file-icon.png';
                                                            e.target.classList.add('file-icon');
                                                        }}
                                                    />
                                                    <button onClick={() => handleDownload(message.img)} className="download-button">
                                                        📥
                                                    </button>
                                                </>
                                            ) : (

                                                <>
                                                    <div className="file-preview">
                                                        {/* Document icon with label */}
                                                        <div className="document-icon-container">
                                                            <span className="document-icon">📄</span>
                                                        </div>

                                                        {/* File name */}
                                                        <p className="file-name" style={{ color: 'black', marginTop: '5px' }}>
                                                            {extractFileName(message.img)}
                                                        </p>
                                                    </div>

                                                    {/* Download button */}
                                                    <button
                                                        onClick={() => handleDownload(message.img)}
                                                        className="download-button"
                                                        title="Download document"
                                                    >
                                                        📥
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    )}


                                    {message.audioUrl ? (
                                        <audio controls>
                                            <source src={message.audioUrl} type="audio/webm" />
                                            Your browser does not support the audio element.
                                        </audio>
                                    ) : (
                                        <p>{message.text}</p>
                                    )}


                                    {message.reactions && Object.keys(message.reactions).length > 0 && (
                                        <div className="message-reactions">
                                            {Object.entries(message.reactions).map(([userId, emoji]) => (
                                                <span
                                                    key={userId}
                                                    className="reaction"
                                                    onClick={() => addReaction(message.createdAt, emoji)}
                                                    title={`Reacted with ${emoji}`}
                                                >
                                                    {emoji}
                                                    {/* Show count if more than 1 user reacted with same emoji */}
                                                    {Object.values(message.reactions).filter(e => e === emoji).length > 1 && (
                                                        <span className="reaction-count">
                                                            {Object.values(message.reactions).filter(e => e === emoji).length}
                                                        </span>
                                                    )}
                                                </span>
                                            ))}
                                        </div>
                                    )}


                                    <div className="message-footer">
                                        <span className="timestamp">{formatTime(message.createdAt)}</span>

                                        {message.senderId === currentUser?.id && (
                                            <div className="seen-indicators">
                                                {message.isSeen ? (
                                                    <span className="seen">✓✓</span> // Blue checkmarks for seen
                                                ) : (
                                                    <span className="not-seen">✓✓</span> // Gray checkmarks for not seen
                                                )}
                                            </div>
                                        )}


                                        <div className="relative inline-block text-left">
                                            <button
                                                onClick={() => toggleMenu(message.createdAt)}
                                                className="menu-button"
                                            >
                                                ⋮
                                            </button>

                                            {menuOpen === message.createdAt && (
                                                <div className="dropdown-menu animate-fade-in">
                                                    <button
                                                        onClick={() => {
                                                            setEmojiPickerForMessage(message.createdAt);
                                                            setMenuOpen(null);
                                                        }}
                                                        className="react-button"
                                                    >
                                                        <span>😀</span>
                                                        Add Reaction
                                                    </button>
                                                    <button
                                                        onClick={() => deleteMessage(message.createdAt)}
                                                        className="delete-button"
                                                    >
                                                        <span>🗑️</span>
                                                        Delete
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {emojiPickerForMessage === message.createdAt && (
                                    <div className="message-emoji-picker">
                                        <button
                                            onClick={() => setEmojiPickerForMessage(null)}
                                            className="close-emoji-picker"
                                        >
                                            ×
                                        </button>
                                        <EmojiPicker
                                            onEmojiClick={(e) => {
                                                addReaction(message.createdAt, e.emoji);
                                                setEmojiPickerForMessage(null);
                                            }}
                                            width={300}
                                            height={350}
                                            searchDisabled
                                            skinTonesDisabled
                                            previewConfig={{ showPreview: false }}
                                        />
                                    </div>
                                )}
                            </div>

                        );

                        return acc;
                    }, [])}
                <div ref={endRef}></div>
            </div>

            <div className="bottom">
                <div className="icons">
                    <label htmlFor="file" id="label">
                        <img src="./img.png" alt="" title={isCurrentUserBlocked || isReceiverBlocked ? "Blocked - cannot send files" : "Attach file"} id="file-doc" style={{
                            cursor: isCurrentUserBlocked || isReceiverBlocked ? 'not-allowed' : 'pointer',
                            opacity: isCurrentUserBlocked || isReceiverBlocked ? 0.6 : 1
                        }} />
                    </label>
                    <input type="file" id="file" style={{ display: "none" }} onChange={handleImg} disabled={isCurrentUserBlocked || isReceiverBlocked} />
                    <img src="./camera.png" alt="camera" onClick={() => !(isCurrentUserBlocked || isReceiverBlocked) && openCamera()} style={{
                        cursor: isCurrentUserBlocked || isReceiverBlocked ? 'not-allowed' : 'pointer',
                        opacity: isCurrentUserBlocked || isReceiverBlocked ? 0.6 : 1
                    }} />
                    <img src={audio.isRecording ? "./play.png" : "./mic.png"} alt="" className={audio.isRecording ? "recording-icon" : ""} disabled={isCurrentUserBlocked || isReceiverBlocked}
                        onClick={() => {
                            if (isCurrentUserBlocked || isReceiverBlocked) return;
                            audio.isRecording ? stopRecording() : startRecording();
                        }}
                        style={{
                            cursor: isCurrentUserBlocked || isReceiverBlocked ? 'not-allowed' : 'pointer',
                            opacity: isCurrentUserBlocked || isReceiverBlocked ? 0.6 : 1
                        }}

                    />
                </div>

                {showCamera && (
                    <div className="camera-popup">
                        {cameraError ? (
                            <div className="camera-error">
                                <p>⚠️ {cameraError}</p>
                                <button onClick={closeCamera}>Close</button>
                                <button onClick={openCamera}>Retry</button>
                            </div>
                        ) : (
                            <>
                                <video
                                    ref={videoRef}
                                    autoPlay
                                    playsInline
                                    muted
                                    className="camera-video"
                                />
                                <canvas ref={canvasRef} style={{ display: "none" }} />

                                <div className="camera-buttons">
                                    <button
                                        onClick={captureScreenshot}
                                        disabled={!isCameraReady || isInitializing}
                                    >
                                        {isInitializing ? "Initializing..." : "📸 Capture"}
                                    </button>
                                    <button onClick={closeCamera}>❌ Close</button>
                                </div>
                            </>
                        )}
                    </div>
                )}
                <input
                    type="text"
                    placeholder={isCurrentUserBlocked || isReceiverBlocked ? "You cannot able to send" : "Type a message..."}
                    onChange={(e) => setText(e.target.value)}
                    value={text}
                    disabled={isCurrentUserBlocked || isReceiverBlocked}
                    onKeyPress={handleKeyPress}
                />
                <div className="emoji">
                    <img src="./emoji.png" alt=""
                        onClick={() => {
                            if (!(isCurrentUserBlocked || isReceiverBlocked)) {
                                setOpen((prev) => !prev);
                            }
                        }}
                        style={{
                            cursor: isCurrentUserBlocked || isReceiverBlocked ? 'not-allowed' : 'pointer',
                            opacity: isCurrentUserBlocked || isReceiverBlocked ? 0.6 : 1
                        }}
                    />
                    <div className="picker">
                        <EmojiPicker open={open} onEmojiClick={handleEmoji} />
                    </div>
                </div>
                <button className="sendButton" onClick={handleSend} disabled={isCurrentUserBlocked || isReceiverBlocked}>
                    Send
                </button>
            </div>
            {showPreview && img.file && (
                <div className="preview-modal">
                    <div className="preview-content">
                        <span className="close-btn" onClick={() => {
                            setImg({ file: null, url: "" });
                            setShowPreview(false);
                        }}>×</span>

                        <h3>File Preview</h3>

                        {img.file.type.startsWith("image/") ? (
                            <img src={img.url} alt="preview" className="popup-image" />
                        ) : (
                            <div className="popup-file-info">
                                <p>📄 {img.file.name}</p>
                            </div>
                        )}

                        <div className="popup-actions">
                            <button className="cancel-btn" onClick={() => {
                                setImg({ file: null, url: "" });
                                setShowPreview(false);
                            }}>Cancel</button>

                            <button className="confirm-btn" onClick={() => {
                                setShowPreview(false);
                                handleSend(); // You already use this
                            }}>Send</button>
                        </div>
                    </div>
                </div>
            )}
        </div>

    );
}