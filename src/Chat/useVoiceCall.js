import {
    useState,
    useRef,
    useEffect
} from 'react';
import {
    doc,
    setDoc,
    getDoc,
    updateDoc,
    onSnapshot,
    arrayUnion,
    collection,
    query,
    where,
    orderBy,
    serverTimestamp,
    limit
} from 'firebase/firestore';
import { db } from '../lib/firebase';

export default function useVoiceCall(currentUserId, otherUserId, currentUser) {
    const [callStatus, setCallStatus] = useState('idle');
    const [localStream, setLocalStream] = useState(null);
    const [remoteStream, setRemoteStream] = useState(null);
    const peerConnection = useRef(null);
    const [currentCallId, setCurrentCallId] = useState(null);
    const hasRemoteDescriptionSet = useRef(false);
    const [callerUsername, setCallerUsername] = useState(null);






    const cleanupCall = async () => {
        try {
            // Stop all media tracks
            if (localStream) {
                localStream.getTracks().forEach(track => track.stop());
                setLocalStream(null);
            }

            if (remoteStream) {
                remoteStream.getTracks().forEach(track => track.stop());
                setRemoteStream(null);
            }

            // Close peer connection
            if (peerConnection.current) {
                peerConnection.current.onicecandidate = null;
                peerConnection.current.ontrack = null;
                peerConnection.current.onconnectionstatechange = null;

                if (peerConnection.current.connectionState !== 'closed') {
                    peerConnection.current.close();
                }
                peerConnection.current = null;
            }

            // Reset state
            setCallStatus('idle');
            setCurrentCallId(null);
            hasRemoteDescriptionSet.current = false;
            setCallerUsername(null);
        } catch (error) {
            console.error("Cleanup error:", error);
        }

        if (peerConnection.current?._unsubscribeCandidates) {
            peerConnection.current._unsubscribeCandidates();
            delete peerConnection.current._unsubscribeCandidates;
        }

    };
    const endCall = async () => {
        try {
            if (currentCallId) {
                // Update Firestore to mark the call as ended for both participants
                await updateDoc(doc(db, 'calls', currentCallId), {
                    status: 'ended',
                    endedAt: serverTimestamp(),
                });
            }
        } catch (error) {
            console.error("Error ending call:", error);
        } finally {
            // Perform cleanup on the current user's side
            await cleanupCall();
        }
    };
    useEffect(() => {
        const handleBeforeUnload = async () => {
            await endCall();
        };

        window.addEventListener('beforeunload', handleBeforeUnload);

        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload);
        };
    }, [endCall]);


    const setupWebRTC = async (callId) => {
        if (!callId) {
            console.error("Call ID is not defined for WebRTC setup.");
            return;
        }
    
        if (peerConnection.current) return;
    
        const config = {
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
        };
    
        peerConnection.current = new RTCPeerConnection(config);
    
        peerConnection.current.onicecandidate = (event) => {
            if (event.candidate) {
                updateDoc(doc(db, 'calls', callId), {
                    [`candidates.${currentUserId}`]: arrayUnion(event.candidate.toJSON()),
                    updatedAt: serverTimestamp()
                });
            }
        };
    
        peerConnection.current.ontrack = (event) => {
            if (event.streams && event.streams[0]) {
                setRemoteStream(event.streams[0]);
            }
        };
    
        peerConnection.current.onconnectionstatechange = () => {
            if (['disconnected', 'closed'].includes(peerConnection.current?.connectionState)) {
                cleanupCall();
            }
        };
    
        const unsubscribeCandidates = onSnapshot(doc(db, 'calls', callId), (docSnap) => {
            const data = docSnap.data();
            if (data?.candidates) {
                const remoteCandidates = data.candidates[otherUserId] || [];
                remoteCandidates.forEach(candidate => {
                    peerConnection.current.addIceCandidate(new RTCIceCandidate(candidate))
                        .catch(e => console.error("Error adding ICE candidate:", e));
                });
            }
        });
    
        peerConnection.current._unsubscribeCandidates = unsubscribeCandidates;
    };
    





    const startCall = async () => {
        try {
            if (callStatus !== 'idle') return;

            await cleanupCall();

            const callId = `call_${currentUserId}_${otherUserId}_${Date.now()}`;
            setCurrentCallId(callId);
            setCallStatus('calling');

            setCurrentCallId(callId);
            setCallStatus('calling');

            await setupWebRTC(callId); // 👈 Pass callId as a parameter

            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true
                },
                video: false
            });
            setLocalStream(stream);
            stream.getTracks().forEach(track => {
                peerConnection.current.addTrack(track, stream);
            });

            const offer = await peerConnection.current.createOffer({
                offerToReceiveAudio: true
            });
            await peerConnection.current.setLocalDescription(offer);

            await setDoc(doc(db, 'calls', callId), {
                callId,
                callerId: currentUserId,
                callerUsername: currentUser?.username || 'Unknown',
                receiverId: otherUserId,
                offer,
                status: 'calling',
                createdAt: serverTimestamp(),
                participants: {
                    [currentUserId]: true,
                    [otherUserId]: false // Initially false for receiver
                },
                candidates: {}
            });

            // Add a listener for the receiver's response
            let answerAlreadySet = false;

            const unsubscribe = onSnapshot(doc(db, 'calls', callId), (doc) => {
                const data = doc.data();

                if (data.status === 'ongoing' && data.answer && !answerAlreadySet) {
                    answerAlreadySet = true;

                    if (peerConnection.current.signalingState === 'have-local-offer') {
                        peerConnection.current.setRemoteDescription(new RTCSessionDescription(data.answer));
                    }

                    setCallStatus('ongoing');
                    unsubscribe();
                }

                if (data.status === 'ended') {
                    endCall();
                    unsubscribe();
                }
            });


        } catch (error) {
            console.error("Call failed:", error);
            await cleanupCall();
        }
    };

    const hasAnswered = useRef(false);

    const answerCall = async () => {
        if (hasAnswered.current) return;
        hasAnswered.current = true;

        try {
            if (callStatus !== 'ringing' || !currentCallId) return;

            setCallStatus('ongoing');
            await setupWebRTC();

            const callDoc = doc(db, 'calls', currentCallId);
            const callSnap = await getDoc(callDoc);

            if (!callSnap.exists()) {
                throw new Error("Call document not found");
            }

            const callData = callSnap.data();

            if (!peerConnection.current.currentRemoteDescription) {
                await peerConnection.current.setRemoteDescription(callData.offer);
            }

            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true
                },
                video: false
            });
            setLocalStream(stream);
            stream.getTracks().forEach(track => {
                peerConnection.current.addTrack(track, stream);
            });

            const answer = await peerConnection.current.createAnswer();
            await peerConnection.current.setLocalDescription(answer);

            await updateDoc(callDoc, {
                answer,
                status: 'ongoing',
                updatedAt: serverTimestamp(),
                [`participants.${currentUserId}`]: true,
                [`participants.${otherUserId}`]: true
            });

        } catch (error) {
            console.error("Answer failed:", error);
            await cleanupCall();
        }
    };





    useEffect(() => {
        if (!currentUserId || !otherUserId) return;

        // Query for incoming calls
        const incomingCallsQuery = query(
            collection(db, 'calls'),
            where('receiverId', '==', currentUserId),
            where('status', '==', 'calling'),
            orderBy('createdAt', 'desc'),
            limit(1)
        );

        // Query for ongoing calls where we're a participant
        const ongoingCallsQuery = query(
            collection(db, 'calls'),
            where(`participants.${currentUserId}`, '==', true),
            where('status', '==', 'ongoing'),
            limit(1)
        );

        const unsubscribeIncoming = onSnapshot(
            incomingCallsQuery,
            (snapshot) => {
                if (snapshot.empty || callStatus !== 'idle') return;

                const callDoc = snapshot.docs[0];
                const callData = callDoc.data();

                setCallerUsername(callData.callerUsername || "Unknown");
                setCurrentCallId(callDoc.id);
                setCallStatus('ringing');

                // Set timeout to auto-decline if not answered
                const timeout = setTimeout(() => {
                    if (callStatus === 'ringing') {
                        endCall();
                    }
                }, 30000); // 30 seconds timeout

                return () => clearTimeout(timeout);
            },
            (error) => {
                console.error("Incoming call listener error:", error);
                if (error.code === 'failed-precondition') {
                    console.log('Create index for:',
                        'collection: calls',
                        'fields: receiverId (asc), status (asc), createdAt (desc)');
                }
            }
        );

        const unsubscribeOngoing = onSnapshot(
            ongoingCallsQuery,
            (snapshot) => {
                if (snapshot.empty) return;

                const callDoc = snapshot.docs[0];
                const callData = callDoc.data();

                // If we're the caller and the call was answered
                if (callData.answer && callData.callerId === currentUserId) {
                    setCurrentCallId(callDoc.id);
                    if (callStatus !== 'ongoing') {
                        setCallStatus('ongoing');
                    }

                    if (peerConnection.current && !hasRemoteDescriptionSet.current) {
                        peerConnection.current.setRemoteDescription(callData.answer)
                            .then(() => {
                                hasRemoteDescriptionSet.current = true;
                            })
                            .catch(e => console.error("Error setting remote description:", e));
                    }
                }



                // Handle call ending
                if (callData.status === 'ended') {
                    endCall();
                }
            },
            (error) => {
                console.error("Ongoing call listener error:", error);
            }
        );


        return () => {
            unsubscribeIncoming();
            unsubscribeOngoing();
        };
    }, [currentUserId, otherUserId, callStatus]);

    return {
        callStatus,
        startCall,
        answerCall,
        endCall,
        localStream,
        remoteStream,
        currentCallId,
        callerUsername
    };

}