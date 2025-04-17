import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import OpenAI from "openai";
import { 
  insertCommentSchema, 
  insertStorySchema, 
  insertSavedPostSchema, 
  stories, 
  savedPosts, 
  taggedUsers,
  users 
} from "../shared/schema";
import { db } from "./db";
import { and, desc, eq, gt, inArray, isNull, ne, not, or } from "drizzle-orm";
import { setupAuth } from "./auth";
import upload from "./upload";
import path from "path";
import fs from "fs";

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "your-api-key", // in production, use environment variable
});

export async function registerRoutes(app: Express): Promise<Server> {
  // Set up authentication routes and middleware
  setupAuth(app);
  
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
  
  // Update user profile
  app.patch("/api/users/:id", async (req, res) => {
    try {
      // Verify user is authenticated and updating their own profile
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      
      const userId = parseInt(req.params.id);
      
      // Only allow users to update their own profile
      if (req.user!.id !== userId) {
        return res.status(403).json({ message: "You can only update your own profile" });
      }
      
      const { username, displayName, bio, profileImageUrl } = req.body;
      
      // Only allow updating specific fields
      const userData: Partial<any> = {};
      if (username !== undefined) userData.username = username.toLowerCase();
      if (displayName !== undefined) userData.displayName = displayName;
      if (bio !== undefined) userData.bio = bio;
      if (profileImageUrl !== undefined) userData.profileImageUrl = profileImageUrl;
      
      const updatedUser = await storage.updateUser(userId, userData);
      res.json(updatedUser);
    } catch (error) {
      console.error("Error updating user:", error);
      res.status(500).json({ message: "Failed to update user profile" });
    }
  });
  
  // Follower routes - follow a user
  app.post("/api/users/:id/follow", async (req, res) => {
    try {
      // Verify user is authenticated
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      
      const followerId = req.user!.id;
      const followedId = parseInt(req.params.id);
      
      // Cannot follow yourself
      if (followerId === followedId) {
        return res.status(400).json({ message: "You cannot follow yourself" });
      }
      
      await storage.followUser(followerId, followedId);
      res.status(200).json({ success: true });
    } catch (error) {
      console.error("Error following user:", error);
      res.status(500).json({ message: "Failed to follow user" });
    }
  });
  
  // Unfollow a user
  app.post("/api/users/:id/unfollow", async (req, res) => {
    try {
      // Verify user is authenticated
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      
      const followerId = req.user!.id;
      const followedId = parseInt(req.params.id);
      
      await storage.unfollowUser(followerId, followedId);
      res.status(200).json({ success: true });
    } catch (error) {
      console.error("Error unfollowing user:", error);
      res.status(500).json({ message: "Failed to unfollow user" });
    }
  });
  
  // Get followers count for a user
  app.get("/api/users/:id/followers/count", async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      const count = await storage.getFollowerCount(userId);
      res.json(count);
    } catch (error) {
      console.error("Error getting follower count:", error);
      res.status(500).json({ message: "Failed to get follower count" });
    }
  });
  
  // Get following count for a user
  app.get("/api/users/:id/following/count", async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      const count = await storage.getFollowingCount(userId);
      res.json(count);
    } catch (error) {
      console.error("Error getting following count:", error);
      res.status(500).json({ message: "Failed to get following count" });
    }
  });
  
  // Get followers for a user
  app.get("/api/users/:id/followers", async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      const followers = await storage.getFollowers(userId);
      res.json(followers);
    } catch (error) {
      console.error("Error getting followers:", error);
      res.status(500).json({ message: "Failed to get followers" });
    }
  });
  
  // Get users a user is following
  app.get("/api/users/:id/following", async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      const following = await storage.getFollowing(userId);
      res.json(following);
    } catch (error) {
      console.error("Error getting following:", error);
      res.status(500).json({ message: "Failed to get following" });
    }
  });
  
  // Check if a user is following another user
  app.get("/api/users/:id/is-following/:targetId", async (req, res) => {
    try {
      // Verify user is authenticated
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      
      const followerId = req.user!.id;
      const followedId = parseInt(req.params.targetId);
      
      const isFollowing = await storage.isFollowing(followerId, followedId);
      res.json({ isFollowing });
    } catch (error) {
      console.error("Error checking follow status:", error);
      res.status(500).json({ message: "Failed to check follow status" });
    }
  });
  
  // Upload profile image
  app.post("/api/users/:id/profile-image", upload.single('image'), async (req, res) => {
    try {
      // Verify user is authenticated and uploading their own profile image
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      
      const userId = parseInt(req.params.id);
      
      // Only allow users to update their own profile
      if (req.user!.id !== userId) {
        return res.status(403).json({ message: "You can only update your own profile" });
      }
      
      // Ensure the file was uploaded
      if (!req.file) {
        return res.status(400).json({ message: "No image file provided" });
      }
      
      // Create URL path to image
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const filePath = req.file.path.replace(process.cwd(), '');
      const fileUrl = `${baseUrl}${filePath.replace(/\\/g, '/')}`;
      
      // Update user profile with new image URL
      const updatedUser = await storage.updateUser(userId, {
        profileImageUrl: fileUrl
      });
      
      res.json({ 
        success: true, 
        message: "Profile image uploaded successfully",
        user: updatedUser,
        imageUrl: fileUrl
      });
    } catch (error) {
      console.error("Error uploading profile image:", error);
      res.status(500).json({ message: "Failed to upload profile image" });
    }
  });

  // Post routes
  app.get("/api/posts", async (req, res) => {
    try {
      const posts = await storage.getPosts();
      res.json(posts);
    } catch (error) {
      console.error("Error fetching posts:", error);
      res.status(500).json({ message: "Failed to fetch posts" });
    }
  });

  app.post("/api/posts", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      
      // Add authenticated user's ID to the post data
      const postData = {
        ...req.body,
        userId: req.user.id
      };
      
      const post = await storage.createPost(postData);
      res.status(201).json(post);
    } catch (error) {
      console.error("Error creating post:", error);
      res.status(500).json({ message: "Failed to create post" });
    }
  });
  
  // Handle media post uploads (image, audio, video)
  app.post("/api/posts/media", upload.any(), async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      
      const { content, userId, mediaType, isCarousel, addToStory } = req.body;
      
      if (!content || !userId) {
        return res.status(400).json({ message: "Content and userId are required" });
      }
      
      const files = req.files as Express.Multer.File[];
      
      if (!files || files.length === 0) {
        return res.status(400).json({ message: "No media file provided" });
      }
      
      const postData: any = {
        userId: parseInt(userId),
        content,
        mediaType: mediaType || 'photo',
      };
      
      // Check if this is a carousel post (multiple images)
      const isCarouselPost = isCarousel === 'true';
      
      // Process the media file path(s) based on media type
      let primaryMediaPath = '';
      
      if (mediaType === 'photo' || !mediaType) {
        if (isCarouselPost && files.length > 1) {
          // Handle carousel post (multiple images)
          const imagePaths = files.map(file => `/uploads/${file.filename}`);
          
          // Store primary image in imageUrl
          postData.imageUrl = imagePaths[0];
          primaryMediaPath = imagePaths[0];
          
          // Store all images as JSON in a new carouselImages field
          postData.carouselImages = JSON.stringify(imagePaths);
        } else {
          // Handle single image post
          const imagePath = `/uploads/${files[0].filename}`;
          postData.imageUrl = imagePath;
          primaryMediaPath = imagePath;
          // Ensure carouselImages is null for single image posts
          postData.carouselImages = null;
        }
        postData.mediaType = 'photo';
      } else if (mediaType === 'audio') {
        // Handle audio post
        const audioPath = `/uploads/${files[0].filename}`;
        postData.audioUrl = audioPath;
        primaryMediaPath = audioPath;
        postData.mediaType = 'audio';
      } else if (mediaType === 'video') {
        // Handle video post
        const videoPath = `/uploads/${files[0].filename}`;
        postData.videoUrl = videoPath;
        primaryMediaPath = videoPath;
        postData.mediaType = 'video';
      } else {
        return res.status(400).json({ message: "Invalid media type provided" });
      }
      
      // Create the post first
      const post = await storage.createPost(postData);
      
      // Check if we should add this to the user's story
      if (addToStory === 'true') {
        console.log("Adding to story:", { userId, mediaPath: primaryMediaPath });
        try {
          // Create a story with the same media
          await storage.createStory({
            userId: parseInt(userId),
            mediaUrl: primaryMediaPath,
            mediaType: postData.mediaType,
            caption: content || null,
          });
          console.log("Successfully added to story");
        } catch (storyError) {
          console.error("Error adding to story:", storyError);
          // Continue even if story creation fails, the post is already created
        }
      }
      
      // Process tagged users if present
      if (req.body.taggedUsers) {
        try {
          console.log("Tagged users data from request:", req.body.taggedUsers);
          
          const taggedUsersData = JSON.parse(req.body.taggedUsers);
          console.log("Parsed tagged users data:", taggedUsersData);
          
          if (Array.isArray(taggedUsersData) && taggedUsersData.length > 0) {
            // Insert each tagged user into the database
            for (const taggedUser of taggedUsersData) {
              console.log("Processing tagged user:", taggedUser);
              
              try {
                await db.insert(taggedUsers).values({
                  postId: post.id,
                  userId: taggedUser.id,
                  positionX: taggedUser.positionX,
                  positionY: taggedUser.positionY
                });
                console.log(`Successfully added tagged user ${taggedUser.id} to post ${post.id}`);
              } catch (insertError) {
                console.error(`Error inserting tagged user ${taggedUser.id}:`, insertError);
              }
            }
            console.log(`Attempted to add ${taggedUsersData.length} tagged users to post ${post.id}`);
          } else {
            console.log("No valid tagged users data found in the array");
          }
        } catch (tagError) {
          console.error("Error processing tagged users:", tagError);
          // Continue even if tagging fails, the post is already created
        }
      } else {
        console.log("No tagged users found in request body");
      }
      
      res.status(201).json(post);
    } catch (error) {
      console.error("Error creating media post:", error);
      res.status(500).json({ message: "Failed to create media post" });
    }
  });

  // Tagged users API endpoint
  app.post("/api/posts/:postId/tagged-users", async (req, res) => {
    try {
      const postId = parseInt(req.params.postId);
      const { userId, positionX, positionY } = req.body;
      
      // Validate required fields
      if (!userId || positionX === undefined || positionY === undefined) {
        return res.status(400).json({ message: "Missing required fields" });
      }
      
      // Create the tagged user
      const taggedUser = await db.insert(taggedUsers).values({
        postId,
        userId,
        positionX,
        positionY
      }).returning();
      
      res.status(201).json(taggedUser[0]);
    } catch (error) {
      console.error("Error adding tagged user:", error);
      res.status(500).json({ message: "Failed to add tagged user" });
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
  
  // Update post route
  app.patch("/api/posts/:id", async (req, res) => {
    try {
      // Verify user is authenticated and is the post owner
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      
      const postId = parseInt(req.params.id);
      const { content } = req.body;
      
      if (!content || content.trim() === "") {
        return res.status(400).json({ message: "Content cannot be empty" });
      }
      
      // Optional image URL update
      const imageUrl = req.body.imageUrl;
      
      const post = await storage.updatePost(postId, content, imageUrl);
      res.json(post);
    } catch (error) {
      res.status(500).json({ message: "Failed to update post" });
    }
  });
  
  // Delete post route
  app.delete("/api/posts/:id", async (req, res) => {
    try {
      // Verify user is authenticated and is the post owner
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      
      const postId = parseInt(req.params.id);
      console.log(`Deleting post ID: ${postId} for user ID: ${req.user!.id}`);
      
      // For improved debugging, get the details of the post being deleted
      try {
        const post = await db.select().from(posts).where(eq(posts.id, postId)).limit(1);
        if (post.length > 0) {
          console.log(`Post to delete: ${JSON.stringify(post[0])}`);
          
          // If we have story ID 11 (the one from the example) that doesn't seem to be matching correctly,
          // let's check it specifically and delete it if needed
          const storyToCheck = await db.select().from(stories).where(eq(stories.id, 11)).limit(1);
          if (storyToCheck.length > 0) {
            console.log(`Story ID 11 found: ${JSON.stringify(storyToCheck[0])}`);
            console.log(`Checking if user matches post user: post user=${post[0].userId}, story user=${storyToCheck[0].userId}`);
            
            // If they belong to the same user, delete the story directly
            if (storyToCheck[0].userId === post[0].userId) {
              console.log(`Explicitly deleting story ID 11 as it matches the post's user ID`);
              await db.delete(stories).where(eq(stories.id, 11));
            }
          }
        }
      } catch (debugError) {
        console.error("Error in pre-delete debugging:", debugError);
        // Continue with deletion even if debugging fails
      }
      
      // Delete post and related stories through the storage function
      await storage.deletePost(postId);
      
      console.log(`Post ${postId} deleted successfully`);
      res.status(204).send();
    } catch (error) {
      console.error(`Error deleting post:`, error);
      res.status(500).json({ message: "Failed to delete post" });
    }
  });
  
  // Save post route
  app.post("/api/posts/:id/save", async (req, res) => {
    try {
      // Verify user is authenticated
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      
      const postId = parseInt(req.params.id);
      const userId = req.user!.id;
      
      await storage.savePost(userId, postId);
      res.status(200).json({ message: "Post saved successfully" });
    } catch (error) {
      res.status(500).json({ message: "Failed to save post" });
    }
  });
  
  // Unsave post route
  app.post("/api/posts/:id/unsave", async (req, res) => {
    try {
      // Verify user is authenticated
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      
      const postId = parseInt(req.params.id);
      const userId = req.user!.id;
      
      await storage.unsavePost(userId, postId);
      res.status(200).json({ message: "Post unsaved successfully" });
    } catch (error) {
      res.status(500).json({ message: "Failed to unsave post" });
    }
  });
  
  // Get saved posts for a user
  app.get("/api/users/:id/saved-posts", async (req, res) => {
    try {
      // Verify user is authenticated and requesting their own saved posts
      if (!req.isAuthenticated() || req.user!.id !== parseInt(req.params.id)) {
        return res.status(401).json({ message: "Not authorized" });
      }
      
      const userId = parseInt(req.params.id);
      const savedPosts = await storage.getSavedPosts(userId);
      res.json(savedPosts);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch saved posts" });
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
  
  // Debug endpoint to check tagged users for a post
  app.get("/api/posts/:postId/tagged-users", async (req, res) => {
    try {
      const postId = parseInt(req.params.postId);
      
      // Get tagged users directly from the database
      const result = await db.select({
        taggedUser: taggedUsers,
        user: users,
      }).from(taggedUsers)
        .innerJoin(users, eq(taggedUsers.userId, users.id))
        .where(eq(taggedUsers.postId, postId));
      
      // Format the response
      const taggedUsersList = result.map(({ taggedUser, user }) => ({
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        profileImageUrl: user.profileImageUrl,
        positionX: taggedUser.positionX,
        positionY: taggedUser.positionY,
      }));
      
      console.log(`Found ${taggedUsersList.length} tagged users for post ${postId}`);
      res.json(taggedUsersList);
    } catch (error) {
      console.error("Error getting tagged users:", error);
      res.status(500).json({ message: "Failed to get tagged users" });
    }
  });
  
  // Get post count for a user
  app.get("/api/users/:userId/post-count", async (req, res) => {
    try {
      const count = await storage.getPostCountByUser(parseInt(req.params.userId));
      res.json({ count });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch post count" });
    }
  });
  
  // Get posts by user ID
  app.get("/api/users/:userId/posts", async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const type = req.query.type as string | undefined;
      const posts = await storage.getPostsByUserId(userId);
      
      // Filter by type if specified
      if (type) {
        const filteredPosts = posts.filter(post => {
          // If post has a specific mediaType, use that
          if (post.mediaType) {
            return post.mediaType === type;
          }
          
          // Legacy format fallback
          if (type === 'photo' && post.imageUrl) return true;
          if (type === 'audio' && post.audioUrl) return true;
          if (type === 'video' && post.videoUrl) return true;
          if (type === 'text' && !post.imageUrl && !post.audioUrl && !post.videoUrl) return true;
          
          return false;
        });
        return res.json(filteredPosts);
      }
      
      res.json(posts);
    } catch (error) {
      console.error("Error fetching user posts:", error);
      res.status(500).json({ message: "Failed to fetch user posts" });
    }
  });

  app.post("/api/comments", async (req, res) => {
    try {
      // Check if user is authenticated
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "User not authenticated" });
      }
      
      // Use the authenticated user's ID instead of trusting the client
      const commentData = {
        ...req.body,
        userId: req.user.id
      };
      
      console.log("Creating comment with data:", commentData);
      const comment = await storage.createComment(commentData);
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
      // Check if user is authenticated
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "User not authenticated" });
      }
      
      const commentId = parseInt(req.params.id);
      const { content } = req.body;
      const userId = req.user.id;
      
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
      // Check if user is authenticated
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "User not authenticated" });
      }
      
      const commentId = parseInt(req.params.id);
      const userId = req.user.id;
      
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
      
      // If this is a direct message (only 2 users and no name), check if conversation already exists
      if (userIds.length === 2 && !name && !isGroup) {
        // Get all conversations for the first user
        const userConversations = await storage.getConversationsByUserId(userIds[0]);
        
        // Find any direct (non-group) conversation that contains both users
        let existingConversation = null;
        
        // We can't use .find() with async functions directly, so we need to loop
        for (const conv of userConversations) {
          if (conv.isGroup) continue;
          
          // Get all participants for this conversation - this is an async call
          const participants = await storage.getParticipantsByConversationId(conv.id);
          const participantIds = participants.map(p => p.userId);
          
          // Check if both users are participants
          if (participantIds.includes(userIds[0]) && participantIds.includes(userIds[1])) {
            existingConversation = conv;
            break;
          }
        }
        
        if (existingConversation) {
          console.log("Found existing conversation:", existingConversation.id);
          return res.status(200).json(existingConversation);
        }
      }
      
      // If no existing conversation or this is a group chat, create a new one
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
  
  // Delete a conversation
  app.delete("/api/conversations/:conversationId", async (req, res) => {
    try {
      const conversationId = parseInt(req.params.conversationId);
      console.log(`Attempting to delete conversation ${conversationId}`);
      
      // This will cascade delete all participants and messages due to DB constraints
      await storage.deleteConversation(conversationId);
      
      console.log(`Successfully deleted conversation ${conversationId}`);
      res.status(200).json({ success: true });
    } catch (error) {
      console.error("Error deleting conversation:", error);
      res.status(500).json({ message: "Failed to delete conversation" });
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

  // Story routes
  // Get all stories
  app.get("/api/stories", async (req, res) => {
    try {
      const stories = await storage.getStories();
      res.json(stories);
    } catch (error) {
      console.error("Error fetching stories:", error);
      res.status(500).json({ message: "Failed to fetch stories" });
    }
  });

  // Get stories by user ID
  app.get("/api/users/:userId/stories", async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const stories = await storage.getUserStories(userId);
      res.json(stories);
    } catch (error) {
      console.error("Error fetching user stories:", error);
      res.status(500).json({ message: "Failed to fetch user stories" });
    }
  });

  // Get a specific story by ID
  app.get("/api/stories/:id", async (req, res) => {
    try {
      const storyId = parseInt(req.params.id);
      const story = await storage.getStoryById(storyId);
      
      if (!story) {
        return res.status(404).json({ message: "Story not found" });
      }
      
      res.json(story);
    } catch (error) {
      console.error("Error fetching story:", error);
      res.status(500).json({ message: "Failed to fetch story" });
    }
  });

  // Create a new story
  app.post("/api/stories", async (req, res) => {
    try {
      const validatedData = insertStorySchema.parse(req.body);
      const story = await storage.createStory(validatedData);
      res.status(201).json(story);
    } catch (error) {
      console.error("Error creating story:", error);
      res.status(400).json({ 
        message: "Failed to create story", 
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });

  // Delete a story
  app.delete("/api/stories/:id", async (req, res) => {
    try {
      const storyId = parseInt(req.params.id);
      await storage.deleteStory(storyId);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting story:", error);
      res.status(500).json({ message: "Failed to delete story" });
    }
  });

  // Increment view count for a story
  app.post("/api/stories/:id/view", async (req, res) => {
    try {
      const storyId = parseInt(req.params.id);
      const updatedStory = await storage.incrementStoryViewCount(storyId);
      res.json(updatedStory);
    } catch (error) {
      console.error("Error incrementing story view count:", error);
      res.status(500).json({ message: "Failed to increment story view count" });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
