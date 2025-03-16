import { useEffect, useState } from "react";
import Chat from "./Chat/Chat.jsx";
import Detail from "./detail/Detail.jsx";
import List from "./list/List.jsx";
import Login from "./login/login.jsx";
import Notification from "./notification/notification.jsx";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "./lib/firebase.js";
import { useUserStore } from "./lib/userStore.js";
import { useChatStore } from "./lib/chatStore.js";

export default function App() {
  const { currentUser, isLoading, fetchUserInfo } = useUserStore();
  const { chatId } = useChatStore();

  // State for toggling details visibility
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  useEffect(() => {
    const unSub = onAuthStateChanged(auth, (user) => {
      fetchUserInfo(user?.uid);
    });

    return () => {
      unSub();
    };
  }, [fetchUserInfo]);

  if (isLoading) return <div className="Loading">Loading...</div>;

  // Function to toggle details
  const toggleDetails = () => {
    setIsDetailOpen((prev) => !prev);
  };

  return (
    <div className="container">
      {currentUser ? (
        <>
          <List />
          {chatId && <Chat toggleDetails={toggleDetails} />}
          {chatId && isDetailOpen && <Detail />}
        </>
      ) : (
        <Login />
      )}
      <Notification />
    </div>
  );
}
