import "./chat.css";
import EmojiPicker from "emoji-picker-react";
import { arrayUnion, doc, getDoc, onSnapshot, updateDoc } from "firebase/firestore";
import { useEffect, useRef, useState } from "react";
import { db } from "../lib/firebase";
import { useChatStore } from "../lib/chatStore";
import { useUserStore } from "../lib/userStore";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";

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

                // Upload the file to Firebase Storage
                await uploadBytes(imgRef, img.file);

                // Get the download URL
                imgUrl = await getDownloadURL(imgRef);
            }

            // Send message with text and/or image
            await updateDoc(doc(db, "chats", chatId), {
                messages: arrayUnion({
                    senderId: currentUser.id,
                    text,
                    createdAt: new Date(),
                    ...(imgUrl && { img: imgUrl }), // Include img URL only if available
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

        // Reset input fields
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

    return (
        <div className="chat">
            <div className="top">
                <div className="user">
                    <img src={user?.avatarUrl || "./avatar.png"} alt="" />
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
                            <div className={`message ${message.senderId === currentUser?.id ? "own" : ""}`} key={message.createdAt}>
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
                                    <div className="message-footer">
                                        <span className="timestamp">{formatTime(message.createdAt)}</span>
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
                                                        onClick={() => deleteMessage(message.createdAt)}
                                                        className="delete-button"
                                                    >
                                                        🗑
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>

                        );

                        return acc;
                    }, [])}
                <div ref={endRef}></div>
            </div>

            <div className="bottom">
                <div className="icons">
                    <label htmlFor="file">
                        <img src="./img.png" alt="" />
                    </label>
                    <input type="file" id="file" style={{ display: "none" }} onChange={handleImg} />
                    <img src="./camera.png" alt="camera" onClick={openCamera} />
                    <img src={audio.isRecording ? "./play.png" : "./mic.png"} alt="" onClick={audio.isRecording ? stopRecording : startRecording} className={audio.isRecording ? "recording-icon" : ""} />
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
                    <img src="./emoji.png" alt="" onClick={() => setOpen((prev) => !prev)} />
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