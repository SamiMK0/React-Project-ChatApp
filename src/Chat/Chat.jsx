import "./chat.css"
import EmojiPicker from "emoji-picker-react"
import { arrayUnion, doc, getDoc, onSnapshot, updateDoc } from "firebase/firestore"
import {useEffect, useRef , useState} from "react"
import { db } from "../lib/firebase"
import { useChatStore } from "../lib/chatStore"
import { useUserStore } from "../lib/userStore"
import uploadToStorj from "../lib/storj"
export default function Chat(){
    const [chat , setChat] = useState()
    const [open , setOpen] = useState(false)
    const [text , setText] = useState("")
    const [img , setImg] = useState({
        file: null,
        url: "",
    })

    const { chatId , user , isCurrentUserBlocked, isReceiverBlocked} = useChatStore()

    const { currentUser } = useUserStore()

    const endRef = useRef(null)

    useEffect(() => {
        endRef.current?.scrollIntoView({behavior: "smooth"})
    } , [])

    useEffect(() => {
        const UnSub = onSnapshot(
            doc(db , "chats" , chatId ), 
            (res) => {
                setChat(res.data())
        })

        return () =>{
            UnSub()
        }
    }, [chatId])


    useEffect(() => {
        // Reset chat state when chatId or user changes
        setChat(null); // Clear the chat messages
        setText(""); // Clear the input field
        setImg({ file: null, url: "" }); // Clear the image preview
    }, [chatId, user]);


    useEffect(() => {
        if (!chatId) {
            setChat(null); // Clear chat instantly when logging out
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
    

    function handleEmoji(e){
        setText(prev=> prev + e.emoji)
        setOpen(false)
    }

    function handleImg(e) {
        if (e.target.files[0]) {
            setImg({
                file: e.target.files[0],
                url: URL.createObjectURL(e.target.files[0])
            });
        }
    }

    const handleSend = async () => {
        if(text === "") return

        let imgUrl = null

        try{

            if(img.file){
                imgUrl = await uploadToStorj(img.file)
            }
            await updateDoc(doc(db , "chats" , chatId) , {
                messages: arrayUnion({
                    senderId: currentUser.id,
                    text,
                    createdAt: new Date (),
                    ...(imgUrl && {img: imgUrl}),
                })
            })

            const userIDs = [currentUser.id , user.id]

            userIDs.forEach(async (id) => {

            

            const userChatsRef = doc(db , "userchats" , id)
            const userChatsSnapshot = await getDoc(userChatsRef)

            if(userChatsSnapshot.exists()){
                const userChatsData = userChatsSnapshot.data()

                const chatIndex = userChatsData.chats.findIndex((c) => c.chatId === chatId)

                userChatsData.chats[chatIndex].lastMessage = text
                userChatsData.chats[chatIndex].isSeen = id === currentUser.id ? true : false
                userChatsData.chats[chatIndex].updatedAt = Date.now()

                await updateDoc(userChatsRef , {
                    chats: userChatsData.chats,
                })
            }
        })
    }
        catch(err){
            console.log(err)
        }

        setImg({
            file: null, 
            url: ""
        })

        setText("")
    }

    return(
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
                    <img src="./info.png" alt="" />
                </div>
            </div>
            <div className="center">
                {chat?.messages?.map((message) => (
                    <div className={message.senderId === currentUser?.id ? "message own" : "message"} key={`${message.senderId}-${message.createdAt}`}>
                        <div className="texts">
                            {message.img && <img src={message.img} alt="" />}
                            <p>{message.text}</p>
                        </div>
                    </div>
                ))}


                {img.url && ( <div className="message own">
                    <div className="texts">
                        <img src={img.url} alt="" />
                    </div>
                </div>
                )}
            <div ref={endRef}>

            </div>
            </div>
            <div className="bottom">
                <div className="icons">
                    <label htmlFor="file">
                        <img src="./img.png" alt="" />
                    </label>
                    
                    <input type="file" id = "file" style={{display: "none"}} onChange={handleImg}/>
                    <img src="./camera.png" alt="" />
                    <img src="./mic.png" alt="" />
                </div>
                <input type="text" placeholder={(isCurrentUserBlocked || isReceiverBlocked) ? "You cannot able to send" : "Type a message..."} onChange={e => setText(e.target.value)} value={text} disabled = {isCurrentUserBlocked || isReceiverBlocked}/>
                <div className="emoji">
                    <img src="./emoji.png" alt="" onClick={() => setOpen(prev=> !prev)}/>
                    <div className="picker">
                        <EmojiPicker open = {open} onEmojiClick={handleEmoji}/>
                    </div>
                    
                </div>
                <button className="sendButton" onClick={handleSend} disabled = {isCurrentUserBlocked || isReceiverBlocked}>Send</button>
            </div>
        </div>
    )
} 