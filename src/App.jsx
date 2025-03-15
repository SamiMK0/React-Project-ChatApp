import { useEffect } from "react"
import Chat from "./Chat/Chat.jsx"
import Detail from "./detail/Detail.jsx"
import List from "./list/List.jsx"
import Login from "./login/login.jsx"
import Notification from "./notification/notification.jsx"
import { onAuthStateChanged } from "firebase/auth"
import { auth } from "./lib/firebase.js"
import { useUserStore } from "./lib/userStore.js"
import { useChatStore } from "./lib/chatStore.js"


export default function App(){

  const {currentUser ,isLoading , fetchUserInfo } = useUserStore()
  const {chatId } = useChatStore()

  useEffect (() =>{
    const unSub = onAuthStateChanged(auth ,(user) =>{
      fetchUserInfo(user?.uid)
    });

    return() =>{
      unSub()
    }
  } , [fetchUserInfo])

  if(isLoading) return <div className="Loading">Loading...</div>


  return(
    <div className="container">
      {
        currentUser ? (
          <>
              <List/>
              {chatId && <Chat/>}
              {chatId && <Detail/>}
          
          </>
        ) : (
        
        <Login/>
        )
      }
      <Notification/>
    </div>
  )
}