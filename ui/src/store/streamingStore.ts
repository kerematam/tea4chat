import { create } from "zustand";
import { MessageType, StreamChunk } from "../hooks/useChatMessages";
import { queryClient } from "@/services/queryClient";
import { InfiniteData } from "@tanstack/react-query";

interface StreamingState {
  streamingMessages: Record<string, MessageType[]>;
  actions: {
    setStreamingMessages: (chatId: string, messages: MessageType[]) => void;
    addStreamingMessage: (chatId: string, message: MessageType) => void;
    updateStreamingMessage: (
      chatId: string,
      messageId: string,
      updater: (msg: MessageType) => MessageType
    ) => void;
    clearStreamingMessages: (chatId: string) => void;
    handleStreamChunk: (chatId: string, chunk: StreamChunk) => void;
    commitStreamingMessagesToQueryCache: (chatId: string) => void;
  };
}



export const useStreamingStore = create<StreamingState>((set, get) => ({
  streamingMessages: {},

  actions: {
    setStreamingMessages: (chatId: string, messages: MessageType[]) => {
      console.log("setStreamingMessages called", { chatId, messages });
      if (!chatId) return;
      set((state) => ({
        streamingMessages: {
          ...state.streamingMessages,
          [chatId]: messages,
        },
      }));
    },

    addStreamingMessage: (chatId: string, message: MessageType) => {
      console.log("addStreamingMessage called", { chatId, message });
      if (!chatId) return;

      set((state) => {
        const currentMessages = state.streamingMessages[chatId] || [];
        const exists = currentMessages.some((msg) => msg.id === message.id);
        if (exists) return state;

        return {
          streamingMessages: {
            ...state.streamingMessages,
            [chatId]: [...currentMessages, message],
          },
        };
      });
    },

    updateStreamingMessage: (
      chatId: string,
      messageId: string,
      updater: (msg: MessageType) => MessageType
    ) => {
      set((state) => ({
        streamingMessages: {
          ...state.streamingMessages,
          [chatId]: (state.streamingMessages[chatId] || []).map((msg) =>
            msg.id === messageId ? updater(msg) : msg
          ),
        },
      }));
    },

    clearStreamingMessages: (chatId: string) => {
      set((state) => ({
        streamingMessages: {
          ...state.streamingMessages,
          [chatId]: [],
        },
      }));
    },

    commitStreamingMessagesToQueryCache: (chatId: string) => {
      const { actions } = get();

      if (!chatId) return;


      const messages = get().streamingMessages[chatId];



      // try to match with query key for testing on query cache
      // const queryData = queryClient.getQueriesData({
      //   queryKey: queryKey,
      //   exact: false
      // });


      //

      const queryKey = [["message", "getMessages"], { "input": { "chatId": chatId }, "type": "infinite" }]
      queryClient.setQueriesData<InfiniteData<MessageType[]> | undefined>(
        {
          queryKey,
          exact: false
        },
        (oldData) => {


        // how old data looks like:
        //   {
        //     "pages": [
        //         {
        //             "messages": [],
        //             "direction": "backward",
        //             "syncDate": "2025-08-03T11:20:26.070Z",
        //             "streamingMessage": null
        //         },
        //         {
        //             "messages": [
        //                 {
        //                     "id": "cmdviqa5z00eionu47qlipp74",
        //                     "content": "hi 3",
        //                     "from": "user",
        //                     "text": "hi 3",
        //                     "modelId": null,
        //                     "status": "COMPLETED",
        //                     "chatId": "cmduo6i0o004qonu443zzqje7",
        //                     "createdAt": "2025-08-03T10:08:11.255Z"
        //                 },
        //                 {
        //                     "id": "cmdviqa6300ekonu4rqehob82",
        //                     "content": "Dog beautiful fast optimization robust fast architecture brown client the network learning lazy performance network algorithm fast library? Observer programming module request programming secure scalable quick data lazy technology experience optimization package server dog lazy elegant. Artificial fox efficient algorithm neural package world dog creative framework design user component performance network machine secure observer. World request package creative hello async dog fast architecture lazy event world lazy problem experience robust solution quick. Creative framework over endpoint the user data algorithm software machine elegant optimization client stream code algorithm stream jumps. Fast event response data optimization the fast elegant science event innovation beautiful component innovation promise lazy listener problem. Technology science server reliable hello machine event callback network component algorithm efficient dog neural event efficient performance user. Development interface solution beautiful intelligence machine problem code thinking world quick event jumps observer robust database beautiful module. Hello jumps brown the module package intelligence event event algorithm performance framework science development database experience solution programming. Hello user software network fast callback performance handler science world component await robust stream machine stream solution data. Data optimization learning endpoint brown development endpoint elegant fox pattern efficient network algorithm brown robust server interface listener! Architecture creative.",
        //                     "from": "assistant",
        //                     "text": "Dog beautiful fast optimization robust fast architecture brown client the network learning lazy performance network algorithm fast library? Observer programming module request programming secure scalable quick data lazy technology experience optimization package server dog lazy elegant. Artificial fox efficient algorithm neural package world dog creative framework design user component performance network machine secure observer. World request package creative hello async dog fast architecture lazy event world lazy problem experience robust solution quick. Creative framework over endpoint the user data algorithm software machine elegant optimization client stream code algorithm stream jumps. Fast event response data optimization the fast elegant science event innovation beautiful component innovation promise lazy listener problem. Technology science server reliable hello machine event callback network component algorithm efficient dog neural event efficient performance user. Development interface solution beautiful intelligence machine problem code thinking world quick event jumps observer robust database beautiful module. Hello jumps brown the module package intelligence event event algorithm performance framework science development database experience solution programming. Hello user software network fast callback performance handler science world component await robust stream machine stream solution data. Data optimization learning endpoint brown development endpoint elegant fox pattern efficient network algorithm brown robust server interface listener! Architecture creative.",
        //                     "modelId": null,
        //                     "status": "COMPLETED",
        //                     "chatId": "cmduo6i0o004qonu443zzqje7",
        //                     "createdAt": "2025-08-03T10:08:11.260Z"
        //                 },
        //                 {
        //                     "id": "cmdvjq0un00g5onu49ymnoujy",
        //                     "content": "hi 4",
        //                     "from": "user",
        //                     "text": "hi 4",
        //                     "modelId": null,
        //                     "status": "COMPLETED",
        //                     "chatId": "cmduo6i0o004qonu443zzqje7",
        //                     "createdAt": "2025-08-03T10:35:58.799Z"
        //                 },
        //                 {
        //                     "id": "cmdvjq0uv00g7onu4g04gn9nu",
        //                     "content": "Experience system hello callback reliable machine process interface observer performance. Fast innovation design neural efficient design code user development science. Response library hello architecture reliable api thinking process problem api. Hello over endpoint architecture database observer observer learning framework callback. Library learning interface library request creative package scalable science hello. World request over database callback request server innovation intelligence lazy. Await scalable system code architecture secure science listener code machine? Package package hello technology software event library system fast algorithm. Quick interface data algorithm design hello thinking efficient process efficient. Component quick robust user code data request reliable quick system. Over module technology stream async brown request intelligence response intelligence. Efficient programming intelligence data quick elegant event architecture user package. Scalable problem package algorithm process development thinking software programming creative. World over async event listener the network await event reliable! Artificial innovation performance problem code database creative library server process. Design database innovation async brown stream code lazy scalable request? Development framework jumps framework framework machine module system innovation endpoint! Robust design endpoint fast module event async programming database response. Jumps server artificial architecture code database database lazy technology thinking? Science handler observer beautiful quick design the software reliable experience.",
        //                     "from": "assistant",
        //                     "text": "Experience system hello callback reliable machine process interface observer performance. Fast innovation design neural efficient design code user development science. Response library hello architecture reliable api thinking process problem api. Hello over endpoint architecture database observer observer learning framework callback. Library learning interface library request creative package scalable science hello. World request over database callback request server innovation intelligence lazy. Await scalable system code architecture secure science listener code machine? Package package hello technology software event library system fast algorithm. Quick interface data algorithm design hello thinking efficient process efficient. Component quick robust user code data request reliable quick system. Over module technology stream async brown request intelligence response intelligence. Efficient programming intelligence data quick elegant event architecture user package. Scalable problem package algorithm process development thinking software programming creative. World over async event listener the network await event reliable! Artificial innovation performance problem code database creative library server process. Design database innovation async brown stream code lazy scalable request? Development framework jumps framework framework machine module system innovation endpoint! Robust design endpoint fast module event async programming database response. Jumps server artificial architecture code database database lazy technology thinking? Science handler observer beautiful quick design the software reliable experience.",
        //                     "modelId": null,
        //                     "status": "COMPLETED",
        //                     "chatId": "cmduo6i0o004qonu443zzqje7",
        //                     "createdAt": "2025-08-03T10:35:58.807Z"
        //                 },
        //                 {
        //                     "id": "cmdvjqo4k00goonu422tjpmvh",
        //                     "content": "hi 5",
        //                     "from": "user",
        //                     "text": "hi 5",
        //                     "modelId": null,
        //                     "status": "COMPLETED",
        //                     "chatId": "cmduo6i0o004qonu443zzqje7",
        //                     "createdAt": "2025-08-03T10:36:28.964Z"
        //                 },
        //                 {
        //                     "id": "cmdvjqo4p00gqonu4zwdyu5d2",
        //                     "content": "Handler handler solution callback component scalable reliable performance module elegant system promise listener library performance neural technology. Await api technology development creative solution dog innovation solution optimization server process promise over callback performance event. Server system event callback stream event database fast architecture hello observer endpoint innovation elegant process beautiful neural. Component secure learning scalable brown system hello jumps machine response client module creative api secure programming api? Over the software api response listener module library learning pattern module data promise science science optimization intelligence. Architecture design async architecture beautiful client experience async framework dog brown network programming world beautiful secure response. Creative dog creative pattern client innovation library server request robust callback module event brown design event hello? Client development solution user user elegant user lazy elegant architecture observer data elegant software handler dog hello! Event database robust client response package system world science jumps innovation lazy intelligence framework efficient event user. Interface library client elegant observer robust observer client stream event beautiful artificial problem interface await process pattern. Development architecture architecture fast system artificial secure observer event neural jumps promise reliable endpoint framework scalable framework! Database async performance data package process stream artificial performance code package server server?",
        //                     "from": "assistant",
        //                     "text": "Handler handler solution callback component scalable reliable performance module elegant system promise listener library performance neural technology. Await api technology development creative solution dog innovation solution optimization server process promise over callback performance event. Server system event callback stream event database fast architecture hello observer endpoint innovation elegant process beautiful neural. Component secure learning scalable brown system hello jumps machine response client module creative api secure programming api? Over the software api response listener module library learning pattern module data promise science science optimization intelligence. Architecture design async architecture beautiful client experience async framework dog brown network programming world beautiful secure response. Creative dog creative pattern client innovation library server request robust callback module event brown design event hello? Client development solution user user elegant user lazy elegant architecture observer data elegant software handler dog hello! Event database robust client response package system world science jumps innovation lazy intelligence framework efficient event user. Interface library client elegant observer robust observer client stream event beautiful artificial problem interface await process pattern. Development architecture architecture fast system artificial secure observer event neural jumps promise reliable endpoint framework scalable framework! Database async performance data package process stream artificial performance code package server server?",
        //                     "modelId": null,
        //                     "status": "COMPLETED",
        //                     "chatId": "cmduo6i0o004qonu443zzqje7",
        //                     "createdAt": "2025-08-03T10:36:28.970Z"
        //                 },
        //                 {
        //                     "id": "cmdvjxk5a00i1onu4ky8ygjoi",
        //                     "content": "hi 6",
        //                     "from": "user",
        //                     "text": "hi 6",
        //                     "modelId": null,
        //                     "status": "COMPLETED",
        //                     "chatId": "cmduo6i0o004qonu443zzqje7",
        //                     "createdAt": "2025-08-03T10:41:50.399Z"
        //                 },
        //                 {
        //                     "id": "cmdvjxk5k00i3onu4w6ces3tl",
        //                     "content": "Over neural fast jumps experience experience beautiful experience software algorithm! Fox component neural listener problem science async package observer fox. System handler callback neural pattern the beautiful event experience reliable! Database system brown promise endpoint intelligence request system neural component. Interface design quick creative innovation interface observer experience design library. Interface component library package development component the secure creative dog. Hello async api framework request async development creative database framework. Solution handler library interface lazy component machine listener response design. Observer process listener quick stream interface brown data process robust? Module neural user brown performance science database creative architecture reliable. Beautiful neural the code quick elegant learning brown the development? Architecture await system artificial quick robust fast the network callback. Code api experience pattern library stream data pattern response performance. Architecture programming reliable client thinking jumps handler solution handler algorithm. Pattern over design architecture database efficient component user innovation client? Creative design code optimization reliable neural response neural fast code. Brown elegant async async module library stream intelligence science artificial. Callback thinking component stream architecture experience endpoint design jumps api? Process fox problem problem robust await fast fast world quick! Robust algorithm lazy learning event optimization reliable artificial library algorithm!",
        //                     "from": "assistant",
        //                     "text": "Over neural fast jumps experience experience beautiful experience software algorithm! Fox component neural listener problem science async package observer fox. System handler callback neural pattern the beautiful event experience reliable! Database system brown promise endpoint intelligence request system neural component. Interface design quick creative innovation interface observer experience design library. Interface component library package development component the secure creative dog. Hello async api framework request async development creative database framework. Solution handler library interface lazy component machine listener response design. Observer process listener quick stream interface brown data process robust? Module neural user brown performance science database creative architecture reliable. Beautiful neural the code quick elegant learning brown the development? Architecture await system artificial quick robust fast the network callback. Code api experience pattern library stream data pattern response performance. Architecture programming reliable client thinking jumps handler solution handler algorithm. Pattern over design architecture database efficient component user innovation client? Creative design code optimization reliable neural response neural fast code. Brown elegant async async module library stream intelligence science artificial. Callback thinking component stream architecture experience endpoint design jumps api? Process fox problem problem robust await fast fast world quick! Robust algorithm lazy learning event optimization reliable artificial library algorithm!",
        //                     "modelId": null,
        //                     "status": "COMPLETED",
        //                     "chatId": "cmduo6i0o004qonu443zzqje7",
        //                     "createdAt": "2025-08-03T10:41:50.408Z"
        //                 },
        //                 {
        //                     "id": "cmdvlb6x5000von6h77i84ekw",
        //                     "content": "hi 7",
        //                     "from": "user",
        //                     "text": "hi 7",
        //                     "modelId": null,
        //                     "status": "COMPLETED",
        //                     "chatId": "cmduo6i0o004qonu443zzqje7",
        //                     "createdAt": "2025-08-03T11:20:26.057Z"
        //                 },
        //                 {
        //                     "id": "cmdvlb6xi000xon6h6ck1p3wq",
        //                     "content": "User response development problem request client database elegant hello scalable quick. Scalable neural database data network scalable brown quick component design network. Network solution data brown learning package data promise handler lazy technology? Development development client optimization machine artificial component system solution elegant event. Dog beautiful handler quick async learning creative learning learning module component. Design code thinking handler creative development quick algorithm machine learning programming. Handler module framework technology code data response library async package component. Response response observer lazy network intelligence creative intelligence promise architecture innovation! Optimization algorithm network software callback response module observer listener artificial endpoint. Callback callback scalable algorithm design code api code fox listener software. Beautiful stream solution database science system await software response handler intelligence. Fox fox programming over over neural stream pattern robust algorithm robust! Await programming jumps beautiful hello async server endpoint client learning api! Science listener framework creative quick fast fast stream hello callback design. Jumps solution dog network software learning dog beautiful await system async. Request listener development process fox server stream machine robust async module? System elegant thinking learning request thinking component reliable package api reliable. Intelligence reliable performance process component design hello design response dog handler. Callback scalable?",
        //                     "from": "assistant",
        //                     "text": "User response development problem request client database elegant hello scalable quick. Scalable neural database data network scalable brown quick component design network. Network solution data brown learning package data promise handler lazy technology? Development development client optimization machine artificial component system solution elegant event. Dog beautiful handler quick async learning creative learning learning module component. Design code thinking handler creative development quick algorithm machine learning programming. Handler module framework technology code data response library async package component. Response response observer lazy network intelligence creative intelligence promise architecture innovation! Optimization algorithm network software callback response module observer listener artificial endpoint. Callback callback scalable algorithm design code api code fox listener software. Beautiful stream solution database science system await software response handler intelligence. Fox fox programming over over neural stream pattern robust algorithm robust! Await programming jumps beautiful hello async server endpoint client learning api! Science listener framework creative quick fast fast stream hello callback design. Jumps solution dog network software learning dog beautiful await system async. Request listener development process fox server stream machine robust async module? System elegant thinking learning request thinking component reliable package api reliable. Intelligence reliable performance process component design hello design response dog handler. Callback scalable?",
        //                     "modelId": null,
        //                     "status": "COMPLETED",
        //                     "chatId": "cmduo6i0o004qonu443zzqje7",
        //                     "createdAt": "2025-08-03T11:20:26.070Z"
        //                 }
        //             ],
        //             "direction": "forward",
        //             "syncDate": "2025-08-03T10:08:11.255Z",
        //             "streamingMessage": null
        //         }
        //     ],
        //     "pageParams": [
        //         "2025-08-03T11:20:26.070Z",
        //         "2025-08-03T11:33:50.537Z"
        //     ]
        // }

          console.log("oldData", oldData);


        
          return oldData
        }
      )

    },

    handleStreamChunk: (_chatId: string, chunk: StreamChunk) => {
      const { actions } = get();
      const chatId = chunk.chatId;
      switch (chunk.type) {
        case "userMessage":
          actions.clearStreamingMessages(chatId);
          actions.addStreamingMessage(chatId, chunk.message);
          break;

        case "aiMessageStart":
          actions.addStreamingMessage(chatId, chunk.message);
          break;

        case "aiMessageChunk":
          actions.updateStreamingMessage(chatId, chunk.messageId, (msg) => ({
            ...msg,
            content: (msg.content || "") + chunk.chunk,
          }));
          break;

        case "aiMessageComplete":
          actions.updateStreamingMessage(chatId, chunk.message.id, () => chunk.message);
          actions.commitStreamingMessagesToQueryCache(chatId);
          break;

        default:
          console.warn("Unknown stream chunk type:", chunk);
          break;
      }
    },
  },
}));
