import { useState, useEffect, useRef } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../../lib/firebase";
import "./StoryModal.css";

export default function StoryModal({
    user, 
    currentIndex, 
    onClose, 
    onNext, 
    onPrev, 
    currentUserId,
    showDeleteOption,
    onToggleDelete,
    onDeleteStory,
    isOwnStory = false
}) {

    const [currentStory, setCurrentStory] = useState(null);
    const [progress, setProgress] = useState(0);
    const [isPaused, setIsPaused] = useState(false);
    const progressInterval = useRef(null);
    const videoRef = useRef(null);

    const formatTimeSinceUpload = (uploadTime) => {
        const now = new Date();
        const diffInSeconds = Math.floor((now - uploadTime) / 1000);
        
        if (diffInSeconds < 60) return `${diffInSeconds}s ago`;
        if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
        if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
        return `${Math.floor(diffInSeconds / 86400)}d ago`;
    };

    useEffect(() => {
        if (user?.stories?.length > 0) {
            setCurrentStory(user.stories[currentIndex]);
            if (!isOwnStory) {
                markStoryAsViewed();
            }
        }
    }, [user, currentIndex]);



    useEffect(() => {
        if (!currentStory) return;

        // Clear any existing interval
        if (progressInterval.current) {
            clearInterval(progressInterval.current);
        }

        // Don't start progress for paused stories
        if (isPaused) return;

        const duration = currentStory.type === 'video' ? 
            Math.min(30000, getVideoDuration()) : 10000;

        let startTime = Date.now();
        const totalDuration = duration;

        progressInterval.current = setInterval(() => {
            const elapsed = Date.now() - startTime;
            const newProgress = (elapsed / totalDuration) * 100;
            
            if (newProgress >= 100) {
                clearInterval(progressInterval.current);
                onNext();
            } else {
                setProgress(newProgress);
            }
        }, 50);

        return () => {
            clearInterval(progressInterval.current);
        };
    }, [currentStory, isPaused]);

    const markStoryAsViewed = async () => {
        if (!user.stories[currentIndex].views.includes(currentUserId)) {
            const userRef = doc(db, "users", user.id);
            try {
                await updateDoc(userRef, {
                    [`stories.${currentIndex}.views`]: arrayUnion(currentUserId)
                });
            } catch (error) {
                console.error("Error marking story as viewed:", error);
            }
        }
    };

    const getVideoDuration = () => {
        if (videoRef.current) {
            return videoRef.current.duration * 1000; // Convert to milliseconds
        }
        return 15000; // Default 15 seconds if can't get duration
    };

    const handleVideoLoaded = () => {
        if (videoRef.current) {
            videoRef.current.play().catch(e => console.log("Autoplay prevented:", e));
        }
    };

    const togglePause = () => {
        setIsPaused(!isPaused);
        if (videoRef.current) {
            if (isPaused) {
                videoRef.current.play();
            } else {
                videoRef.current.pause();
            }
        }
    };

    return (
        <div className="story-modal-overlay" onClick={onClose}>
            <div className="story-modal-content" onClick={(e) => e.stopPropagation()}>
                <button className="story-close-btn" onClick={onClose}>✕</button>
                
                <div className="story-header">
                    <img src={user.avatarUrl || "./avatar.png"} alt="" className="story-user-avatar" />
                    <span className="story-username">{user.username}</span>
                    {currentStory?.createdAt && (
                        <div className="story-time">
                            {formatTimeSinceUpload(currentStory.createdAt.toDate())}
                        </div>
                    )}
                    {isOwnStory && (
                        <button 
                            className="story-more-btn"
                            onClick={(e) => {
                                e.stopPropagation();
                                onToggleDelete();
                            }}
                        >
                            ⋮
                        </button>
                    )}
                </div>
                {showDeleteOption && (
                    <div className="story-delete-option" onClick={(e) => e.stopPropagation()}>
                        <button onClick={() => {
                            onDeleteStory();
                            onToggleDelete();
                        }}>
                            Delete Story
                        </button>
                    </div>
                )}

                <div className="story-progress-container">
                    {user.stories.map((_, index) => (
                        <div key={index} className="story-progress-track">
                            <div 
                                className={`story-progress-bar ${index === currentIndex ? 'active' : ''}`}
                                style={{ 
                                    width: index === currentIndex ? `${progress}%` : 
                                           index < currentIndex ? '100%' : '0%'
                                }}
                            ></div>
                        </div>
                    ))}
                </div>

                <div className="story-media-container">
                    {currentStory?.type === 'image' && (
                        <img 
                            src={currentStory.url} 
                            alt="Story" 
                            className="story-media"
                            onClick={togglePause}
                        />
                    )}
                    {currentStory?.type === 'video' && (
                        <video
                            ref={videoRef}
                            src={currentStory.url}
                            className="story-media"
                            onClick={togglePause}
                            onLoadedMetadata={handleVideoLoaded}
                            controls={false}
                            loop={false}
                        />
                    )}
                </div>

                <div className="story-nav-buttons">
                    <button className="story-prev-btn" onClick={(e) => { e.stopPropagation(); onPrev(); }}>←</button>
                    <button className="story-next-btn" onClick={(e) => { e.stopPropagation(); onNext(); }}>→</button>
                </div>
            </div>
        </div>
    );
}