import "./userinfo.css";
import { useUserStore } from "../../lib/userStore";
import { useChatStore } from "../../lib/chatStore";
import { auth } from "../../lib/firebase";
import { useState, useRef, useEffect } from "react";
import { uploadBytes, getDownloadURL, ref as storageRef } from "firebase/storage";
import { db, storage } from "../../lib/firebase";
import { doc, updateDoc, arrayUnion, Timestamp, arrayRemove } from "firebase/firestore";
import StoryModal from "../Chatlist/StoryModal";
export default function Userinfo() {
    const { currentUser, updateUser } = useUserStore();
    const fileInputRef = useRef(null);
    const avatarInputRef = useRef(null);
    const [isUploading, setIsUploading] = useState(false);
    const [showEditPopup, setShowEditPopup] = useState(false);
    const [editForm, setEditForm] = useState({
        username: "",
        bio: ""
    });
    const [avatarPreview, setAvatarPreview] = useState(null);
    const [showStoryModal, setShowStoryModal] = useState(false);
    const [currentStoryIndex, setCurrentStoryIndex] = useState(0);
    const [showDeleteOption, setShowDeleteOption] = useState(false);

    useEffect(() => {
        if (currentUser) {
            setEditForm({
                username: currentUser.username || "",
                bio: currentUser.bio || ""
            });
        }
    }, [currentUser]);

    const handleLogout = () => {
        useChatStore.getState().resetChat(); 
        useUserStore.getState().resetUser();
    
        setTimeout(() => {
            auth.signOut().catch(err => console.error("Logout Error:", err));
        }, 0);
    };

    const handleAddStory = () => {
        fileInputRef.current.click();
    };

    const handleFileChange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setIsUploading(true);
        
        try {
            // Upload file to Firebase Storage
            const fileRef = storageRef(storage, `stories/${currentUser.id}/${Date.now()}_${file.name}`);
            await uploadBytes(fileRef, file);
            const fileUrl = await getDownloadURL(fileRef);

            // Add story to Firestore with expiration time (24 hours)
            const expiresAt = Timestamp.fromDate(new Date(Date.now() + 24 * 60 * 60 * 1000));
            const userRef = doc(db, "users", currentUser.id);
            
            await updateDoc(userRef, {
                stories: arrayUnion({
                    url: fileUrl,
                    type: file.type.split('/')[0], // 'image', 'video', etc.
                    createdAt: Timestamp.now(),
                    expiresAt,
                    views: []
                })
            });

        } catch (error) {
            console.error("Error uploading story:", error);
        } finally {
            setIsUploading(false);
        }
    };

    const handleAvatarChange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        try {
            setIsUploading(true);
            setAvatarPreview(URL.createObjectURL(file));

            // Upload new avatar
            const avatarRef = storageRef(storage, `avatars/${currentUser.id}/${file.name}`);
            await uploadBytes(avatarRef, file);
            const avatarUrl = await getDownloadURL(avatarRef);

            // Update user in Firestore
            const userRef = doc(db, "users", currentUser.id);
            await updateDoc(userRef, {
                avatarUrl
            });

            // Update local state
            updateUser({ ...currentUser, avatarUrl });

        } catch (error) {
            console.error("Error updating avatar:", error);
        } finally {
            setIsUploading(false);
        }
    };

    const handleEditProfile = () => {
        setShowEditPopup(true);
    };

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setEditForm(prev => ({
            ...prev,
            [name]: value
        }));
    };

    const handleSaveProfile = async () => {
        try {
            setIsUploading(true);
            
            // Update user in Firestore
            const userRef = doc(db, "users", currentUser.id);
            await updateDoc(userRef, {
                username: editForm.username,
                bio: editForm.bio
            });

            // Update local state
            updateUser({ 
                ...currentUser, 
                username: editForm.username,
                bio: editForm.bio
            });

            setShowEditPopup(false);
        } catch (error) {
            console.error("Error updating profile:", error);
        } finally {
            setIsUploading(false);
        }
    };

    const handleAvatarClick = () => {
        if (currentUser.stories?.length > 0) {
            setShowStoryModal(true);
            setCurrentStoryIndex(0);
        }
    };

    const closeStoryModal = () => {
        setShowStoryModal(false);
        setShowDeleteOption(false);
    };

    const goToNextStory = () => {
        if (currentStoryIndex < currentUser.stories.length - 1) {
            setCurrentStoryIndex(currentStoryIndex + 1);
            setShowDeleteOption(false);
        } else {
            closeStoryModal();
        }
    };

    const goToPrevStory = () => {
        if (currentStoryIndex > 0) {
            setCurrentStoryIndex(currentStoryIndex - 1);
            setShowDeleteOption(false);
        }
    };

    const toggleDeleteOption = () => {
        setShowDeleteOption(!showDeleteOption);
    };

    const deleteCurrentStory = async () => {
        if (!currentUser.stories || currentUser.stories.length === 0) return;
        
        try {
            setIsUploading(true);
            const userRef = doc(db, "users", currentUser.id);
            const storyToDelete = currentUser.stories[currentStoryIndex];
            
            await updateDoc(userRef, {
                stories: arrayRemove(storyToDelete)
            });

            // Update local state
            const updatedStories = [...currentUser.stories];
            updatedStories.splice(currentStoryIndex, 1);
            updateUser({ ...currentUser, stories: updatedStories });

            // Adjust story index if needed
            if (currentStoryIndex >= updatedStories.length && updatedStories.length > 0) {
                setCurrentStoryIndex(updatedStories.length - 1);
            } else if (updatedStories.length === 0) {
                closeStoryModal();
            }

            setShowDeleteOption(false);
        } catch (error) {
            console.error("Error deleting story:", error);
        } finally {
            setIsUploading(false);
        }
    };

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
        <div className="userinfo">
            <div className="user">
                <div className="avatar-container">
                    <img 
                        src={avatarPreview || currentUser.avatarUrl || "./avatar.png"} 
                        alt="" 
                        className={`user-avatar ${currentUser.stories?.length > 0 ? 'has-story' : ''}`}
                        onClick={handleAvatarClick}
                        style={{ cursor: currentUser.stories?.length > 0 ? 'pointer' : 'default' }}
                    />
                    <button 
                        className="avatar-edit-button"
                        onClick={() => avatarInputRef.current.click()}
                        title="Change avatar"
                    >
                        ✏️
                    </button>
                </div>
                <div className="user-text-info">
                    <h2>{currentUser.username}</h2>
                    <p className="user-bio">{currentUser.bio || "No bio yet"}</p>
                </div>
            </div>
            <div className="icons">
                <button 
                    onClick={handleLogout} 
                    className="logout-icon-button"
                    title="Logout"
                >
                    🔴
                </button>
                <button 
                    onClick={handleAddStory}
                    className="add-story-button"
                    disabled={isUploading}
                    title="Add story"
                >
                    {isUploading ? '⏳' : '➕'}
                </button>
                <button 
                    onClick={handleEditProfile}
                    className="edit-profile-button"
                    title="Edit profile"
                >
                    ✏️
                </button>
                
                <input 
                    type="file" 
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    accept="image/*,video/*"
                    style={{ display: 'none' }}
                />
                
                <input 
                    type="file" 
                    ref={avatarInputRef}
                    onChange={handleAvatarChange}
                    accept="image/*"
                    style={{ display: 'none' }}
                />
            </div>

            {/* Edit Profile Popup */}
            {showEditPopup && (
                <div className="edit-profile-popup">
                    <div className="popup-overlay" onClick={() => setShowEditPopup(false)}></div>
                    <div className="popup-content">
                        <h3>Edit Profile</h3>
                        <div className="form-group">
                            <label>Username</label>
                            <input
                                type="text"
                                name="username"
                                value={editForm.username}
                                onChange={handleInputChange}
                                maxLength="30"
                            />
                        </div>
                        <div className="form-group">
                            <label>Bio</label>
                            <textarea
                                name="bio"
                                value={editForm.bio}
                                onChange={handleInputChange}
                                maxLength="150"
                                rows="3"
                            />
                        </div>
                        <div className="popup-actions">
                            <button 
                                className="cancel-btn"
                                onClick={() => setShowEditPopup(false)}
                                disabled={isUploading}
                            >
                                Cancel
                            </button>
                            <button 
                                className="save-btn"
                                onClick={handleSaveProfile}
                                disabled={isUploading}
                            >
                                {isUploading ? 'Saving...' : 'Save Changes'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Story Modal */}
            {showStoryModal && currentUser.stories?.length > 0 && (
                <StoryModal
                    user={currentUser}
                    currentIndex={currentStoryIndex}
                    onClose={closeStoryModal}
                    onNext={goToNextStory}
                    onPrev={goToPrevStory}
                    currentUserId={currentUser.id}
                    showDeleteOption={showDeleteOption}
                    onToggleDelete={toggleDeleteOption}
                    onDeleteStory={deleteCurrentStory}
                    isOwnStory={true}
                />
            )}
        </div>
    );
}