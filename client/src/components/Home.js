import React, { useCallback, useEffect, useState, useContext } from "react";
import axios from "axios";
import { useHistory } from "react-router-dom";
import { Grid, CssBaseline, Button } from "@material-ui/core";
import { makeStyles } from "@material-ui/core/styles";

import { SidebarContainer } from "../components/Sidebar";
import { ActiveChat } from "../components/ActiveChat";
import { SocketContext } from "../context/socket";

const useStyles = makeStyles((theme) => ({
  root: {
    height: "100vh",
  },
}));

const Home = ({ user, logout }) => {
  const history = useHistory();

  const socket = useContext(SocketContext);

  const [conversations, setConversations] = useState([]);
  const [activeConversation, setActiveConversation] = useState(null);

  const classes = useStyles();
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  const addSearchedUsers = (users) => {
    const currentUsers = {};

    // make table of current users so we can lookup faster
    conversations.forEach((convo) => {
      currentUsers[convo.otherUser.id] = true;
    });

    const newState = [...conversations];
    users.forEach((user) => {
      // only create a fake convo if we don't already have a convo with this user
      if (!currentUsers[user.id]) {
        let fakeConvo = { otherUser: user, messages: [] };
        newState.push(fakeConvo);
      }
    });

    setConversations(newState);
  };

  const clearSearchedUsers = () => {
    setConversations((prev) => prev.filter((convo) => convo.id));
  };

  const saveMessage = async (body) => {
    const { data } = await axios.post("/api/messages", body);
    return data;
  };

  const sendMessage = (data, body) => {
    socket.emit("new-message", {
      message: data.message,
      recipientId: body.recipientId,
      sender: data.sender,
    });
  };

  // Lets the other users client know their messages were read
  const readMessages = useCallback(
      (messages, convoId) => {
        socket.emit("read-messages", {
          messages: messages,
          convoId: convoId,
        });
    },
    [socket]
  );
  // batch updates array of messages, see api/messages.put()
  const updateMessages = useCallback(
    async (messages) => {
      await axios.put("/api/messages/read", messages);
    },
    []
  )

  const postMessage = async (body) => {
    try {
      body.isRead = body.conversationId === activeConversation.id && body.recipientId !== activeConversation.otherUser.id
      const data = await saveMessage(body);

      if (!body.conversationId) {
        addNewConvo(body.recipientId, data.message);
      } else {
        addMessageToConversation(data);
      }
      sendMessage(data, body);
      if (body.isRead) {
        readMessages([data.message], body.conversationId)
      }
    } catch (error) {
      console.error(error);
    }
  };

  const addNewConvo = useCallback(
    (recipientId, message) => {
      setConversations((prev) =>
        prev.map((convo) => {
          if (convo.otherUser.id === recipientId) {
            const convoCopy = { ...convo };
            convoCopy.messages = [...convo.messages, message];
            convoCopy.latestMessageText = message.text;
            convoCopy.id = message.conversationId;
            return convoCopy;
          } else {
            return convo;
          }
        })
      )
    },
    [],
  );

  const addMessageToConversation = useCallback(
    (data) => {
      // if sender isn't null, that means the message needs to be put in a brand new convo
      const { message, sender = null } = data;
      if (sender !== null) {
        const newConvo = {
          id: message.conversationId,
          otherUser: sender,
          messages: [message],
        };
        newConvo.latestMessageText = message.text;
        newConvo.unreadMessageCount = 1;
        setConversations((prev) => [newConvo, ...prev]);
      }
        const newlyReadMessages = []
        setConversations((prev) =>
          prev.map((convo) => {
            if (convo.id === message.conversationId) {
              const convoCopy = { ...convo };
              if (!message.isRead && message.senderId === convo.otherUser.id) {
                if (!activeConversation || activeConversation.id !== convo.id) {
                  convoCopy.unreadMessageCount += 1;
                } else {
                  message.isRead = true
                  newlyReadMessages.push(message);
                }
              }
              if (message.isRead && message.senderId !== convo.otherUser.id) {
                convoCopy.lastReadMessage = message;
              }

              convoCopy.messages = [...convo.messages, message];
              convoCopy.latestMessageText = message.text;
              return convoCopy;
            } else {
              return convo;
            }
          })
        );
        if (newlyReadMessages.length) {
          readMessages(newlyReadMessages, message.conversationId);
        }
    },
    [activeConversation, readMessages],
  );

  const updateMessagesInConversation = useCallback(
    (data) => {
      const { messages, convoId } = data;
      setConversations((prev) => {
        const newConvos = prev.map((convo) => {
          if (convo.id === convoId) {
            const convoCopy = {...convo};
            convoCopy.messages = convo.messages.map(m => {return {...m}});
            messages.forEach((message) => {
              convoCopy.messages = convo.messages.map(m => m.id === message.id ? message : m)
              if (message.isRead && message.senderId !== convo.otherUser.id) {
                convoCopy.lastReadMessage = message;
              }
            });
            return convoCopy;
          } else {
            return convo;
          }
        })
        return newConvos;
      })
      updateMessages(messages);
    },
    [updateMessages]
  );

  const setActiveChat = async (conversation) => {
    setActiveConversation(conversation);
    const newlyReadMessages = [];
    await setConversations((prev) =>
      prev.map((convo) => {
        if (convo.id === conversation.id) {
          const convoCopy = { ...convo };
          convoCopy.messages = [...convo.messages];
          convoCopy.messages.forEach((message) => {
            if (!message.isRead && message.senderId === convo.otherUser.id) {
              message.isRead = true;
              newlyReadMessages.push(message);
            }
            if (message.isRead && message.senderId !== convo.otherUser.id) {
              convoCopy.lastReadMessage = message;
            }
          });
          convoCopy.unreadMessageCount = 0;
          return convoCopy;
        } else {
          return convo;
        }
      })
    );
    if (newlyReadMessages.length) {
      readMessages(newlyReadMessages, conversation.id);
    }
  };

  const addOnlineUser = useCallback((id) => {
    setConversations((prev) =>
      prev.map((convo) => {
        if (convo.otherUser.id === id) {
          const convoCopy = { ...convo };
          convoCopy.otherUser = { ...convoCopy.otherUser, online: true };
          return convoCopy;
        } else {
          return convo;
        }
      }),
    );
  }, []);

  const removeOfflineUser = useCallback((id) => {
    setConversations((prev) =>
      prev.map((convo) => {
        if (convo.otherUser.id === id) {
          const convoCopy = { ...convo };
          convoCopy.otherUser = { ...convoCopy.otherUser, online: false };
          return convoCopy;
        } else {
          return convo;
        }
      }),
    );
  }, []);

  // Lifecycle

  useEffect(() => {
    // Socket init
    socket.on("add-online-user", addOnlineUser);
    socket.on("remove-offline-user", removeOfflineUser);
    socket.on("new-message", addMessageToConversation);
    socket.on("read-messages", updateMessagesInConversation)

    return () => {
      // before the component is destroyed
      // unbind all event handlers used in this component
      socket.off("add-online-user", addOnlineUser);
      socket.off("remove-offline-user", removeOfflineUser);
      socket.off("new-message", addMessageToConversation);
      socket.off("read-messages", updateMessagesInConversation)
    };
  }, [addMessageToConversation, updateMessagesInConversation, addOnlineUser, removeOfflineUser, socket]);

  useEffect(() => {
    // when fetching, prevent redirect
    if (user?.isFetching) return;

    if (user && user.id) {
      setIsLoggedIn(true);
    } else {
      // If we were previously logged in, redirect to login instead of register
      if (isLoggedIn) history.push("/login");
      else history.push("/register");
    }
  }, [user, history, isLoggedIn]);

  useEffect(() => {
    const fetchConversations = async () => {
      try {
        const { data } = await axios.get("/api/conversations");
        setConversations(data);
      } catch (error) {
        console.error(error);
      }
    };
    if (!user.isFetching) {
      fetchConversations();
    }
  }, [user]);

  const handleLogout = async () => {
    if (user && user.id) {
      await logout(user.id);
    }
  };

  return (
    <>
      <Button onClick={handleLogout}>Logout</Button>
      <Grid container component="main" className={classes.root}>
        <CssBaseline />
        <SidebarContainer
          conversations={conversations}
          user={user}
          clearSearchedUsers={clearSearchedUsers}
          addSearchedUsers={addSearchedUsers}
          setActiveChat={setActiveChat}
        />
        <ActiveChat
          activeConversation={activeConversation}
          conversations={conversations}
          user={user}
          postMessage={postMessage}
        />
      </Grid>
    </>
  );
};

export default Home;
