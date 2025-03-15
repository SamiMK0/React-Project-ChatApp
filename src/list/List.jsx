import "./list.css"
import Userinfo from "./user-info/Userinfo"
import Chatlist from "./Chatlist/chatlist"
export default function List(){
    return(
        <div className="list">
            <Userinfo/>
            <Chatlist/>

        </div>
    )
}