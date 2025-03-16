import { create } from "zustand";
import { useUserStore } from "./userStore";

export const useChatStore = create((set) => ({
    chatId: null,
    user: null,
    isCurrentUserBlocked: false,
    isReceiverBlocked: false,
    isDetailOpen: false, // <-- Added this state

    changeChat: (chatId, user) => {
        const currentUser = useUserStore.getState().currentUser;

        // Check if the current user is blocked
        if (user.blocked.includes(currentUser.id)) {
            return set({
                chatId,
                user: null,
                isCurrentUserBlocked: true,
                isReceiverBlocked: false,
            });
        }

        // Check if the receiver is blocked
        else if (currentUser.blocked.includes(user.id)) {
            return set({
                chatId,
                user,
                isCurrentUserBlocked: false,
                isReceiverBlocked: true,
            });
        }

        else {
            return set({
                chatId,
                user,
                isCurrentUserBlocked: false,
                isReceiverBlocked: false,
            });
        }
    },

    toggleDetail: () => set((state) => ({ isDetailOpen: !state.isDetailOpen })), // <-- Added toggle function

    changeBlock: () => {
        set((state) => ({ ...state, isReceiverBlocked: !state.isReceiverBlocked }));
    },

    resetChat: () => set({ chatId: null, user: null, isCurrentUserBlocked: false, isReceiverBlocked: false }), 
}));
