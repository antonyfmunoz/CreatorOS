import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import OpenAI from "openai";
import { insertCommentSchema } from "../shared/schema";

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "your-api-key", // in production, use environment variable
});

export async function registerRoutes(app: Express): Promise<Server> {
  // prefix all routes with /api
  
  // User routes
  app.get("/api/users", async (req, res) => {
    try {
      // If search query is provided in the query params
      if (req.query.search) {
        const users = await storage.searchUsersByUsername(req.query.search as string);
        return res.json(users);
      }
      
      // Otherwise return all users
      const users = await storage.getAllUsers();
      res.json(users);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  app.get("/api/users/:id", async (req, res) => {
    try {
      const user = await storage.getUser(parseInt(req.params.id));
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      res.json(user);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Post routes
  app.get("/api/posts", async (req, res) => {
    try {
      const posts = await storage.getPosts();
      res.json(posts);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch posts" });
    }
  });

  app.post("/api/posts", async (req, res) => {
    try {
      const post = await storage.createPost(req.body);
      res.status(201).json(post);
    } catch (error) {
      res.status(500).json({ message: "Failed to create post" });
    }
  });

  app.post("/api/posts/:id/like", async (req, res) => {
    try {
      const post = await storage.likePost(parseInt(req.params.id));
      res.json(post);
    } catch (error) {
      res.status(500).json({ message: "Failed to like post" });
    }
  });
  
  app.post("/api/posts/:id/unlike", async (req, res) => {
    try {
      const post = await storage.unlikePost(parseInt(req.params.id));
      res.json(post);
    } catch (error) {
      res.status(500).json({ message: "Failed to unlike post" });
    }
  });

  // Comment routes
  app.get("/api/posts/:postId/comments", async (req, res) => {
    try {
      const comments = await storage.getCommentsByPostId(parseInt(req.params.postId));
      res.json(comments);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch comments" });
    }
  });
  
  // Get total comment count for a post (including all replies)
  app.get("/api/posts/:postId/comment-count", async (req, res) => {
    try {
      const count = await storage.getTotalCommentCountForPost(parseInt(req.params.postId));
      res.json({ count });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch comment count" });
    }
  });

  app.post("/api/comments", async (req, res) => {
    try {
      console.log("Creating comment with data:", req.body);
      // Skip validation for now to debug
      const comment = await storage.createComment(req.body);
      res.status(201).json(comment);
    } catch (error) {
      console.error("Error creating comment:", error);
      res.status(500).json({ message: "Failed to create comment" });
    }
  });
  
  app.get("/api/comments/:commentId/replies", async (req, res) => {
    try {
      const replies = await storage.getCommentReplies(parseInt(req.params.commentId));
      res.json(replies);
    } catch (error: any) {
      console.error("Error fetching comment replies:", error);
      res.status(500).json({ message: "Failed to fetch comment replies", error: error.message });
    }
  });

  // Get a single comment by ID
  app.get("/api/comments/:id", async (req, res) => {
    try {
      const comment = await storage.getCommentById(parseInt(req.params.id));
      if (!comment) {
        return res.status(404).json({ message: "Comment not found" });
      }
      res.json(comment);
    } catch (error: any) {
      console.error("Error fetching comment:", error);
      res.status(500).json({ message: "Failed to fetch comment" });
    }
  });

  // Update a comment
  app.put("/api/comments/:id", async (req, res) => {
    try {
      const commentId = parseInt(req.params.id);
      const { content, userId } = req.body;
      
      // Verify the comment belongs to the user before updating
      const comment = await storage.getCommentById(commentId);
      
      if (!comment) {
        return res.status(404).json({ message: "Comment not found" });
      }
      
      if (comment.userId !== userId) {
        return res.status(403).json({ message: "You can only edit your own comments" });
      }
      
      const updatedComment = await storage.updateComment(commentId, content);
      res.json(updatedComment);
    } catch (error: any) {
      console.error("Error updating comment:", error);
      res.status(500).json({ message: "Failed to update comment" });
    }
  });

  // Delete a comment
  app.delete("/api/comments/:id", async (req, res) => {
    try {
      const commentId = parseInt(req.params.id);
      const userId = parseInt(req.query.userId as string);
      
      // Verify the comment belongs to the user before deleting
      const comment = await storage.getCommentById(commentId);
      
      if (!comment) {
        return res.status(404).json({ message: "Comment not found" });
      }
      
      if (comment.userId !== userId) {
        return res.status(403).json({ message: "You can only delete your own comments" });
      }
      
      await storage.deleteComment(commentId);
      res.status(204).send();
    } catch (error: any) {
      console.error("Error deleting comment:", error);
      res.status(500).json({ message: "Failed to delete comment" });
    }
  });

  app.post("/api/comments/:id/like", async (req, res) => {
    try {
      // Get the comment ID from the URL parameter
      const commentId = parseInt(req.params.id);
      
      // Like the comment
      const comment = await storage.likeComment(commentId);
      
      // Get the updated comment with user details if it's a top-level comment
      if (comment.parentId === null) {
        const updatedComment = await storage.getCommentById(commentId);
        if (updatedComment) {
          return res.json(updatedComment);
        }
      }
      
      // Otherwise, return the comment as is
      res.json(comment);
    } catch (error: any) {
      console.error("Error liking comment:", error);
      res.status(500).json({ message: "Failed to like comment", error: error.message });
    }
  });
  
  app.post("/api/comments/:id/unlike", async (req, res) => {
    try {
      // Get the comment ID from the URL parameter
      const commentId = parseInt(req.params.id);
      
      // Unlike the comment
      const comment = await storage.unlikeComment(commentId);
      
      // Get the updated comment with user details if it's a top-level comment
      if (comment.parentId === null) {
        const updatedComment = await storage.getCommentById(commentId);
        if (updatedComment) {
          return res.json(updatedComment);
        }
      }
      
      // Otherwise, return the comment as is
      res.json(comment);
    } catch (error: any) {
      console.error("Error unliking comment:", error);
      res.status(500).json({ message: "Failed to unlike comment", error: error.message });
    }
  });

  // Product routes
  app.get("/api/products", async (req, res) => {
    try {
      if (req.query.category) {
        const products = await storage.getProductsByCategory(req.query.category as string);
        return res.json(products);
      }
      
      const products = await storage.getProducts();
      res.json(products);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch products" });
    }
  });

  app.get("/api/products/:id", async (req, res) => {
    try {
      const product = await storage.getProductById(parseInt(req.params.id));
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }
      res.json(product);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch product" });
    }
  });

  app.post("/api/products", async (req, res) => {
    try {
      const product = await storage.createProduct(req.body);
      res.status(201).json(product);
    } catch (error) {
      res.status(500).json({ message: "Failed to create product" });
    }
  });

  // AI Agent routes
  app.get("/api/ai-agents", async (req, res) => {
    try {
      const agents = await storage.getAIAgents();
      res.json(agents);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch AI agents" });
    }
  });

  app.get("/api/ai-agents/user/:userId", async (req, res) => {
    try {
      const agents = await storage.getUserAIAgents(parseInt(req.params.userId));
      res.json(agents);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch user AI agents" });
    }
  });

  app.get("/api/ai-agents/:id", async (req, res) => {
    try {
      const agent = await storage.getAIAgentById(parseInt(req.params.id));
      if (!agent) {
        return res.status(404).json({ message: "AI agent not found" });
      }
      res.json(agent);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch AI agent" });
    }
  });

  app.post("/api/ai-agents", async (req, res) => {
    try {
      const agent = await storage.createAIAgent(req.body);
      res.status(201).json(agent);
    } catch (error) {
      res.status(500).json({ message: "Failed to create AI agent" });
    }
  });

  // AI Chat routes
  app.get("/api/ai-chats/:agentId/:userId", async (req, res) => {
    try {
      const chats = await storage.getAIChatsByAgentId(
        parseInt(req.params.agentId),
        parseInt(req.params.userId)
      );
      res.json(chats);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch AI chats" });
    }
  });

  app.post("/api/ai-chats", async (req, res) => {
    try {
      const chat = await storage.createAIChat(req.body);
      res.status(201).json(chat);
    } catch (error) {
      res.status(500).json({ message: "Failed to create AI chat" });
    }
  });

  app.put("/api/ai-chats/:id", async (req, res) => {
    try {
      const chat = await storage.updateAIChat(parseInt(req.params.id), req.body.messages);
      res.json(chat);
    } catch (error) {
      res.status(500).json({ message: "Failed to update AI chat" });
    }
  });

  // OpenAI integration for AI chat
  app.post("/api/ai-chat/message", async (req, res) => {
    try {
      const { agentId, message, systemPrompt } = req.body;
      
      // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt || "You are a helpful assistant." },
          { role: "user", content: message }
        ],
      });
      
      res.json({ reply: response.choices[0].message.content });
    } catch (error) {
      console.error("OpenAI API error:", error);
      res.status(500).json({ message: "Failed to get AI response" });
    }
  });

  // Community routes
  app.get("/api/communities", async (req, res) => {
    try {
      const communities = await storage.getCommunities();
      res.json(communities);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch communities" });
    }
  });

  app.get("/api/communities/:id", async (req, res) => {
    try {
      const community = await storage.getCommunityById(parseInt(req.params.id));
      if (!community) {
        return res.status(404).json({ message: "Community not found" });
      }
      res.json(community);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch community" });
    }
  });

  app.post("/api/communities", async (req, res) => {
    try {
      const community = await storage.createCommunity(req.body);
      res.status(201).json(community);
    } catch (error) {
      res.status(500).json({ message: "Failed to create community" });
    }
  });

  // Channel routes
  app.get("/api/communities/:communityId/channels", async (req, res) => {
    try {
      const channels = await storage.getChannelsByCommunityId(parseInt(req.params.communityId));
      res.json(channels);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch channels" });
    }
  });

  app.post("/api/channels", async (req, res) => {
    try {
      const channel = await storage.createChannel(req.body);
      res.status(201).json(channel);
    } catch (error) {
      res.status(500).json({ message: "Failed to create channel" });
    }
  });

  // Channel Message routes
  app.get("/api/channels/:channelId/messages", async (req, res) => {
    try {
      const messages = await storage.getMessagesByChannelId(parseInt(req.params.channelId));
      res.json(messages);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch messages" });
    }
  });

  app.post("/api/channel-messages", async (req, res) => {
    try {
      const message = await storage.createChannelMessage(req.body);
      res.status(201).json(message);
    } catch (error) {
      res.status(500).json({ message: "Failed to create message" });
    }
  });

  app.post("/api/channel-messages/:id/pin", async (req, res) => {
    try {
      const message = await storage.pinChannelMessage(parseInt(req.params.id));
      res.json(message);
    } catch (error) {
      res.status(500).json({ message: "Failed to pin message" });
    }
  });

  app.post("/api/channel-messages/:id/like", async (req, res) => {
    try {
      const message = await storage.likeChannelMessage(parseInt(req.params.id));
      res.json(message);
    } catch (error) {
      res.status(500).json({ message: "Failed to like message" });
    }
  });

  // Revenue routes
  app.get("/api/users/:userId/revenue", async (req, res) => {
    try {
      const revenue = await storage.getRevenueByUserId(parseInt(req.params.userId));
      res.json(revenue);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch revenue data" });
    }
  });

  // Contact routes
  app.get("/api/users/:userId/contacts", async (req, res) => {
    try {
      const contacts = await storage.getContactsByUserId(parseInt(req.params.userId));
      res.json(contacts);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch contacts" });
    }
  });

  app.post("/api/contacts", async (req, res) => {
    try {
      const contact = await storage.createContact(req.body);
      res.status(201).json(contact);
    } catch (error) {
      res.status(500).json({ message: "Failed to create contact" });
    }
  });

  // Document routes
  app.get("/api/users/:userId/documents", async (req, res) => {
    try {
      const documents = await storage.getDocumentsByUserId(parseInt(req.params.userId));
      res.json(documents);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch documents" });
    }
  });

  app.get("/api/documents/:id", async (req, res) => {
    try {
      const document = await storage.getDocumentById(parseInt(req.params.id));
      if (!document) {
        return res.status(404).json({ message: "Document not found" });
      }
      res.json(document);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch document" });
    }
  });

  app.post("/api/documents", async (req, res) => {
    try {
      const document = await storage.createDocument(req.body);
      res.status(201).json(document);
    } catch (error) {
      res.status(500).json({ message: "Failed to create document" });
    }
  });

  app.put("/api/documents/:id", async (req, res) => {
    try {
      const document = await storage.updateDocument(
        parseInt(req.params.id),
        req.body.title,
        req.body.content
      );
      res.json(document);
    } catch (error) {
      res.status(500).json({ message: "Failed to update document" });
    }
  });
  
  // Messaging routes
  // Get all conversations for a user
  app.get("/api/users/:userId/conversations", async (req, res) => {
    try {
      const conversations = await storage.getConversationsByUserId(parseInt(req.params.userId));
      res.json(conversations);
    } catch (error) {
      console.error("Error fetching conversations:", error);
      res.status(500).json({ message: "Failed to fetch conversations" });
    }
  });
  
  // Create a new conversation
  app.post("/api/conversations", async (req, res) => {
    try {
      const { userIds, name, isGroup } = req.body;
      console.log("Received conversation creation request:", { userIds, name, isGroup });
      
      if (!userIds || !Array.isArray(userIds) || userIds.length < 2) {
        console.error("Invalid userIds:", userIds);
        return res.status(400).json({ message: "At least two users are required" });
      }
      
      // Check all userIds are valid numbers
      const invalidIds = userIds.filter(id => typeof id !== 'number');
      if (invalidIds.length > 0) {
        console.error("Invalid user IDs (not numbers):", invalidIds);
        return res.status(400).json({ message: "All user IDs must be numbers" });
      }
      
      console.log("Creating conversation with userIds:", userIds, "name:", name, "isGroup:", isGroup);
      const conversation = await storage.createConversation(userIds, name, isGroup);
      console.log("Created conversation:", conversation);
      
      // Add participants to the conversation
      console.log("Adding participants to conversation:", conversation.id);
      for (const userId of userIds) {
        await storage.addParticipantToConversation(conversation.id, userId);
      }
      
      res.status(201).json(conversation);
    } catch (error) {
      console.error("Error creating conversation:", error);
      res.status(500).json({ message: "Failed to create conversation", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });
  
  // Get messages for a conversation
  app.get("/api/conversations/:conversationId/messages", async (req, res) => {
    try {
      const messages = await storage.getMessagesByConversationId(parseInt(req.params.conversationId));
      res.json(messages);
    } catch (error) {
      console.error("Error fetching messages:", error);
      res.status(500).json({ message: "Failed to fetch messages" });
    }
  });
  
  // Send a message
  app.post("/api/messages", async (req, res) => {
    try {
      const message = await storage.createDirectMessage(req.body);
      res.status(201).json(message);
    } catch (error) {
      console.error("Error creating message:", error);
      res.status(500).json({ message: "Failed to send message" });
    }
  });
  
  // Edit a message
  app.patch("/api/messages/:id", async (req, res) => {
    try {
      const messageId = parseInt(req.params.id);
      const { content, isEdited } = req.body;
      
      const updatedMessage = await storage.updateDirectMessage(messageId, { 
        content, 
        isEdited: true 
      });
      
      res.json(updatedMessage);
    } catch (error) {
      console.error("Error updating message:", error);
      res.status(500).json({ message: "Failed to update message" });
    }
  });
  
  // Delete a message
  app.delete("/api/messages/:id", async (req, res) => {
    try {
      const messageId = parseInt(req.params.id);
      await storage.deleteDirectMessage(messageId);
      res.status(204).end();
    } catch (error) {
      console.error("Error deleting message:", error);
      res.status(500).json({ message: "Failed to delete message" });
    }
  });
  
  // Add/update reaction to a message
  app.post("/api/messages/:id/reaction", async (req, res) => {
    try {
      const messageId = parseInt(req.params.id);
      const { userId, reaction } = req.body;
      
      const updatedMessage = await storage.addReactionToMessage(messageId, userId, reaction);
      res.json(updatedMessage);
    } catch (error) {
      console.error("Error adding reaction:", error);
      res.status(500).json({ message: "Failed to add reaction" });
    }
  });
  
  // Mark conversation as read
  app.patch("/api/conversations/:conversationId/read", async (req, res) => {
    try {
      await storage.markConversationAsRead(
        parseInt(req.params.conversationId),
        req.body.userId
      );
      res.json({ success: true });
    } catch (error) {
      console.error("Error marking conversation as read:", error);
      res.status(500).json({ message: "Failed to mark conversation as read" });
    }
  });
  
  // Get unread message count for a user
  app.get("/api/users/:userId/unread-count", async (req, res) => {
    try {
      const count = await storage.getUnreadMessageCountForUser(parseInt(req.params.userId));
      res.json({ count });
    } catch (error) {
      console.error("Error getting unread count:", error);
      res.status(500).json({ message: "Failed to get unread message count" });
    }
  });
  
  // Notification routes
  // Get notifications for a user
  app.get("/api/users/:userId/notifications", async (req, res) => {
    try {
      const notifications = await storage.getNotificationsByUserId(parseInt(req.params.userId));
      res.json(notifications);
    } catch (error) {
      console.error("Error fetching notifications:", error);
      res.status(500).json({ message: "Failed to fetch notifications" });
    }
  });
  
  // Create a notification
  app.post("/api/notifications", async (req, res) => {
    try {
      const notification = await storage.createNotification(req.body);
      res.status(201).json(notification);
    } catch (error) {
      console.error("Error creating notification:", error);
      res.status(500).json({ message: "Failed to create notification" });
    }
  });
  
  // Mark a notification as read
  app.patch("/api/notifications/:id/mark-read", async (req, res) => {
    try {
      const notification = await storage.markNotificationAsRead(req.params.id);
      res.json(notification);
    } catch (error) {
      console.error("Error marking notification as read:", error);
      res.status(500).json({ message: "Failed to mark notification as read" });
    }
  });
  
  // Mark all notifications as read for a user
  app.patch("/api/users/:userId/notifications/mark-all-read", async (req, res) => {
    try {
      await storage.markAllNotificationsAsRead(parseInt(req.params.userId));
      res.status(200).json({ message: "All notifications marked as read" });
    } catch (error) {
      console.error("Error marking all notifications as read:", error);
      res.status(500).json({ message: "Failed to mark all notifications as read" });
    }
  });
  
  // Delete a notification
  app.delete("/api/notifications/:id", async (req, res) => {
    try {
      await storage.deleteNotification(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting notification:", error);
      res.status(500).json({ message: "Failed to delete notification" });
    }
  });
  
  // Delete all notifications for a user
  app.delete("/api/users/:userId/notifications", async (req, res) => {
    try {
      await storage.deleteAllNotifications(parseInt(req.params.userId));
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting all notifications:", error);
      res.status(500).json({ message: "Failed to delete all notifications" });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
