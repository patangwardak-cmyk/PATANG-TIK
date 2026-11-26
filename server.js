const express = require("express");
const helmet = require("helmet");
const multer = require("multer");
const cors = require("cors");
const fs = require("fs");
const crypto = require("crypto");
const path = require("path");
const { rateLimit } = require("express-rate-limit");

const app = express();

app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));

app.use(helmet.contentSecurityPolicy({
  useDefaults: false,
  directives: {
    "default-src": ["'self'"],
    "script-src": ["'self'"],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:"],
    "media-src": ["'self'", "blob:"],
    "connect-src": ["'self'"],
    "font-src": ["'self'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "frame-ancestors": ["'self'"],
    "form-action": ["'self'"]
  },
  reportOnly: true
}));


const registerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 3,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      message: "د حساب جوړولو ډېرې هڅې وشوې؛ ۱۵ دقیقې وروسته بیا هڅه وکړه"
    });
  }
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      message: "د ننوتلو ډېرې هڅې وشوې؛ ۱۵ دقیقې وروسته بیا هڅه وکړه"
    });
  }
});

const accountDeleteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      message: "د حساب د حذف ډېرې هڅې وشوې؛ ۱۵ دقیقې وروسته بیا هڅه وکړه"
    });
  }
});

const DATA_DIR = path.resolve(process.env.DATA_DIR || __dirname);
const VIDEO_DIR = path.resolve(process.env.VIDEO_DIR || path.join(DATA_DIR, "videos"));
const AVATAR_DIR = path.resolve(process.env.AVATAR_DIR || path.join(DATA_DIR, "uploads", "avatars"));

for (const dir of [DATA_DIR, VIDEO_DIR, AVATAR_DIR]) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
}

const PORT = Number(process.env.PORT) || 3000;
const SESSION_TTL = 24 * 60 * 60 * 1000;
const sessions = new Map();

function getSession(token) {
  const session = sessions.get(token);
  if (!session) return null;

  if (Date.now() >= session.expiresAt) {
    sessions.delete(token);
    return null;
  }

  return session;
}

function requireAuth(req, res, next) {
  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const session = getSession(token);
  if (!session) return res.status(401).json({ message: "ناسته پای ته رسېدلې؛ بیا حساب ته ننوځه" });

  const account = readUsers().find(u => u.username === session.username);
  if (!account || account.blocked === true) {
    sessions.delete(token);
    return res.status(403).json({ message: "دا حساب بند شوی دی" });
  }

  req.username = session.username;
  next();
}


app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.get("/app.js", (req, res) => {
  res.type("application/javascript");
  res.sendFile(path.join(__dirname, "app.js"));
});
app.use("/videos", express.static(VIDEO_DIR));
app.use("/uploads/avatars", express.static(AVATAR_DIR));
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

function readAdminLogs() {
  const file = path.join(DATA_DIR, "admin-logs.json");
  if (!fs.existsSync(file)) fs.writeFileSync(file, "[]");
  return JSON.parse(fs.readFileSync(file, "utf8") || "[]");
}

function saveAdminLog(admin, action, target) {
  const logs = readAdminLogs();
  logs.unshift({
    id: crypto.randomUUID(),
    admin,
    action,
    target,
    date: new Date().toISOString()
  });
  saveAdminLogs(logs.slice(0, 500));
}

function saveAdminLogs(logs) {
  const file = path.join(DATA_DIR, "admin-logs.json");
  const tempFile = file + ".tmp";
  try {
    fs.writeFileSync(tempFile, JSON.stringify(logs, null, 2), { mode: 0o600 });
    fs.renameSync(tempFile, file);
  } catch (error) {
    try {
      if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
    } catch {}
    throw error;
  }
}

function readNotifications() {
  const file = path.join(DATA_DIR, "notifications.json");
  if (!fs.existsSync(file)) fs.writeFileSync(file, "[]");
  return JSON.parse(fs.readFileSync(file, "utf8") || "[]");
}

function writeJsonAtomically(file, data) {
  const tempFile = file + ".tmp";
  try {
    fs.writeFileSync(tempFile, JSON.stringify(data, null, 2), { mode: 0o600 });
    fs.renameSync(tempFile, file);
  } catch (error) {
    try {
      if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
    } catch {}
    throw error;
  }
}

function saveNotifications(items) {
  writeJsonAtomically(path.join(DATA_DIR, "notifications.json"), items);
}

function readVideos() {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, "videos.json"), "utf8") || "[]");
}

function saveVideos(videos) {
  writeJsonAtomically(path.join(DATA_DIR, "videos.json"), videos);
}

function cleanDeletedUserFromVideos(videos, username) {
  const target = String(username || "").toLowerCase();

  const isTarget = value =>
    typeof value === "string" &&
    value.toLowerCase() === target;

  for (const video of videos) {
    if (Array.isArray(video.likedBy)) {
      video.likedBy = video.likedBy.filter(user => !isTarget(user));
    }

    if (!Array.isArray(video.comments)) continue;

    video.comments = video.comments
      .filter(comment => !isTarget(comment.owner))
      .map(comment => {
        if (Array.isArray(comment.likedBy)) {
          const oldLength = comment.likedBy.length;
          comment.likedBy = comment.likedBy.filter(user => !isTarget(user));

          if (comment.likedBy.length !== oldLength &&
              typeof comment.likes === "number") {
            comment.likes = Math.max(0, comment.likes - (oldLength - comment.likedBy.length));
          }
        }

        if (Array.isArray(comment.replies)) {
          comment.replies = comment.replies.filter(
            reply => !isTarget(reply.owner)
          );
        }

        return comment;
      });
  }

  return videos;
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, VIDEO_DIR),
  filename: (req, file, cb) => cb(null, crypto.randomUUID() + ".upload")
});

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    cb(null, file.mimetype.startsWith("video/") || file.mimetype === "application/octet-stream");
  }
});

const avatarStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, AVATAR_DIR),
  filename: (req, file, cb) => {
    const ext = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp" }[file.mimetype];
    cb(null, crypto.randomBytes(16).toString("hex") + ext);
  }
});

const avatarUpload = multer({
  storage: avatarStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    cb(null, ["image/jpeg", "image/png", "image/webp"].includes(file.mimetype));
  }
});

app.post("/upload", requireAuth, upload.single("video"), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: "ویډیو انتخاب کړه" });

  let finalPath = null;

  try {
    const { fileTypeFromFile } = await import("file-type");
    const detected = await fileTypeFromFile(req.file.path);
    const extensions = {
      "video/webm": ".webm",
      "video/mp4": ".mp4",
      "video/quicktime": ".mov",
      "video/3gpp": ".3gp",
      "video/x-matroska": ".mkv"
    };
    const ext = detected && extensions[detected.mime];

    if (!ext) {
      await fs.promises.unlink(req.file.path).catch(() => {});
      return res.status(415).json({ message: "دا د ویډیو معتبر یا ملاتړ شوی فایل نه دی" });
    }

    const filename = crypto.randomUUID() + ext;
    finalPath = path.join(VIDEO_DIR, filename);
    await fs.promises.rename(req.file.path, finalPath);

    const videos = readVideos();
    const video = {
      name: filename,
      url: "/videos/" + filename,
      owner: req.username,
      caption: String(req.body.caption || "").slice(0, 500),
      date: new Date().toISOString(),
      likes: 0
    };

    videos.unshift(video);
    saveVideos(videos);
    res.json({ message: "ویډیو ثبت شوه", video });
  } catch (error) {
    if (req.file && fs.existsSync(req.file.path)) {
      await fs.promises.unlink(req.file.path).catch(() => {});
    }
    if (finalPath && fs.existsSync(finalPath)) {
      await fs.promises.unlink(finalPath).catch(() => {});
    }
    console.error("Video upload error:", error.message);
    res.status(500).json({ message: "د ویډیو اپلوډ کې ستونزه رامنځته شوه" });
  }
});


function readUsers() {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, "users.json"), "utf8") || "[]");
}


function readMessages() {
  const file = path.join(DATA_DIR, "messages.json");
  if (!fs.existsSync(file)) fs.writeFileSync(file, "[]");
  return JSON.parse(fs.readFileSync(file, "utf8") || "[]");
}

function saveMessages(messages) {
  writeJsonAtomically(path.join(DATA_DIR, "messages.json"), messages);
}

function saveUsers(users) {
  writeJsonAtomically(path.join(DATA_DIR, "users.json"), users);
}

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString("hex");
}

function verifyPassword(password, salt, storedHash) {
  try {
    const expected = Buffer.from(String(storedHash || ""), "hex");
    const actual = Buffer.from(hashPassword(password, salt), "hex");
    return expected.length === 64 &&
      actual.length === expected.length &&
      crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

app.post("/api/register", registerLimiter, (req, res) => {
  const username = String(req.body.username || "").trim();
  const password = String(req.body.password || "");

  if (!/^[a-zA-Z0-9_]{3,20}$/.test(username))
    return res.status(400).json({ message: "نوم باید ۳ تر ۲۰ تورو وي؛ یوازې انګلیسي توري، شمېرې او _ وکاروه" });

  if (password.length < 8)
    return res.status(400).json({ message: "پاسورډ لږ تر لږه ۸ توري وي" });

  const users = readUsers();
  if (users.some(u => u.username.toLowerCase() === username.toLowerCase()))
    return res.status(409).json({ message: "دا نوم مخکې کارول شوی" });

  const salt = crypto.randomBytes(16).toString("hex");
  users.push({ username, salt, passwordHash: hashPassword(password, salt), createdAt: new Date().toISOString() });
  saveUsers(users);
  res.json({ message: "حساب جوړ شو" });
});

app.post("/api/login", loginLimiter, (req, res) => {
  const username = String(req.body.username || "").trim();
  const password = String(req.body.password || "");
  const users = readUsers();
  const user = users.find(u => u.username.toLowerCase() === username.toLowerCase());

  if (!user || !verifyPassword(password, user.salt, user.passwordHash))
    return res.status(401).json({ message: "نوم یا پاسورډ ناسم دی" });

  if (user.blocked === true)
    return res.status(403).json({ message: "دا حساب بند شوی دی" });

  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, { username: user.username, expiresAt: Date.now() + SESSION_TTL });
  res.json({ message: "ننوتل بریالي شول", token, username: user.username });
});

app.get("/api/me", (req, res) => {
  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const session = getSession(token);
  if (!session) return res.status(401).json({ message: "ناسته پای ته رسېدلې؛ بیا حساب ته ننوځه" });

  const user = readUsers().find(u => u.username === session.username);
  if (!user || user.blocked === true) {
    sessions.delete(token);
    return res.status(403).json({ message: "دا حساب شتون نه لري یا بند شوی دی" });
  }

  res.json({ username: user.username, avatar: user.avatar || "", role: user.role || "user" });
});

app.delete("/api/account", accountDeleteLimiter, requireAuth, (req, res) => {
  const password = String(req.body.password || "");
  const users = readUsers();
  const originalUsers = JSON.parse(JSON.stringify(users));
  const index = users.findIndex(
    user => user.username.toLowerCase() === req.username.toLowerCase()
  );

  if (index === -1) {
    return res.status(404).json({ message: "حساب ونه موندل شو" });
  }

  const account = users[index];

  if (!verifyPassword(password, account.salt, account.passwordHash)) {
    return res.status(401).json({ message: "پاسورډ ناسم دی" });
  }

  if (account.role === "admin" &&
      !users.some(user =>
        user.role === "admin" &&
        user.username.toLowerCase() !== account.username.toLowerCase()
      )) {
    return res.status(403).json({
      message: "ته یوازینی اډمین یې؛ مخکې باید بل اډمین موجود وي"
    });
  }

  const username = account.username;
  const matchesUser = value => {
    if (typeof value === "string") {
      return value.toLowerCase() === username.toLowerCase();
    }
    if (value && typeof value === "object") {
      return [value.username, value.from].some(
        name => typeof name === "string" &&
          name.toLowerCase() === username.toLowerCase()
      );
    }
    return false;
  };

  const originalMessages = readMessages();
  const originalNotifications = readNotifications();
  const originalVideos = readVideos();
  const videos = cleanDeletedUserFromVideos(
    JSON.parse(JSON.stringify(originalVideos)), username
  );

  users.splice(index, 1);

  for (const user of users) {
    for (const field of ["following", "followers", "followRequests"]) {
      if (Array.isArray(user[field])) {
        user[field] = user[field].filter(item => !matchesUser(item));
      }
    }
  }

  const messages = originalMessages.filter(
    message => !matchesUser(message.from) && !matchesUser(message.to)
  );

  const notifications = originalNotifications.filter(
    notification =>
      !matchesUser(notification.user) && !matchesUser(notification.from)
  );

  try {
    saveUsers(users);
    saveMessages(messages);
    saveNotifications(notifications);
    saveVideos(videos);
  } catch (error) {
    const rollbackErrors = [];

    try { saveUsers(originalUsers); }
    catch (e) { rollbackErrors.push("users"); }

    try { saveMessages(originalMessages); }
    catch (e) { rollbackErrors.push("messages"); }

    try { saveNotifications(originalNotifications); }
    catch (e) { rollbackErrors.push("notifications"); }

    try { saveVideos(originalVideos); }
    catch (e) { rollbackErrors.push("videos"); }

    console.error(
      "Self account deletion failed; rollback failures:",
      rollbackErrors.join(", ") || "none"
    );

    return res.status(500).json({
      message: rollbackErrors.length
        ? "حذف ناکام شو؛ د معلوماتو بېرته ساتلو کې هم ستونزه رامنځته شوه"
        : "حذف ناکام شو؛ پخواني معلومات بېرته وساتل شول"
    });
  }

  for (const [token, session] of sessions.entries()) {
    if (session.username.toLowerCase() === username.toLowerCase()) {
      sessions.delete(token);
    }
  }

  if (typeof account.avatar === "string" &&
      account.avatar.startsWith("/uploads/avatars/")) {
    const avatarName = path.basename(account.avatar);
    const avatarPath = path.join(AVATAR_DIR, avatarName);
    try {
      if (fs.existsSync(avatarPath)) fs.unlinkSync(avatarPath);
    } catch (error) {
      console.error("Could not remove deleted user's avatar:", error.message);
    }
  }

  try {
    saveAdminLog(username, "خپل حساب حذف", username);
  } catch (error) {
    console.error("Self deletion succeeded, but admin log could not be saved:", error.message);
  }

  return res.json({
    message: "حساب، اړیکې، پیغامونه، خبرتیاوې او د هغه تبصرې او ځوابونه حذف شول؛ ویډیوګانې او راپورونه پاتې دي"
  });
});

app.post("/api/avatar", requireAuth, (req, res) => {
  avatarUpload.single("avatar")(req, res, async err => {
    if (err) return res.status(400).json({message:"عکس باید JPG، PNG یا WebP وي او تر ۵ MB کم وي"});
    if (!req.file) return res.status(400).json({message:"عکس انتخاب کړه"});

    try {
      const { fileTypeFromFile } = await import("file-type");
      const detected = await fileTypeFromFile(req.file.path);
      const allowed = ["image/jpeg", "image/png", "image/webp"];

      if (!detected || !allowed.includes(detected.mime) ||
          detected.mime !== req.file.mimetype) {
        await fs.promises.unlink(req.file.path).catch(() => {});
        return res.status(415).json({message:"د عکس اصلي بڼه ناسمه ده؛ JPG، PNG یا WebP وکاروه"});
      }

      const users = readUsers();
      const me = users.find(u => u.username === req.username);

      if (!me) {
        await fs.promises.unlink(req.file.path).catch(() => {});
        return res.status(404).json({message:"حساب ونه موندل شو"});
      }

      const oldAvatar = me.avatar;
      const newAvatar = "/uploads/avatars/" + req.file.filename;
      me.avatar = newAvatar;

      try {
        saveUsers(users);
      } catch (error) {
        await fs.promises.unlink(req.file.path).catch(() => {});
        throw error;
      }

      if (typeof oldAvatar === "string" &&
          oldAvatar.startsWith("/uploads/avatars/")) {
        const oldName = path.basename(oldAvatar);
        const oldPath = path.join(AVATAR_DIR, oldName);
        if (oldName && oldName !== path.basename(newAvatar)) {
          await fs.promises.unlink(oldPath).catch(() => {});
        }
      }

      return res.json({message:"د پروفایل عکس بدل شو", avatar:newAvatar});
    } catch (error) {
      console.error("Avatar upload error:", error.message);
      return res.status(500).json({message:"د عکس په ثبتولو کې ستونزه رامنځته شوه"});
    }
  });
});

app.post("/api/follow/:username", requireAuth, (req, res) => {
  const users = readUsers();
  const me = users.find(u => u.username === req.username);
  const target = users.find(u => u.username.toLowerCase() === String(req.params.username || "").toLowerCase());

  if (!target) return res.status(404).json({message:"کارن ونه موندل شو"});
  if (target.username === me.username) return res.status(400).json({message:"خپل ځان نه شې تعقیبولی"});

  me.following = me.following || [];
  target.followers = target.followers || [];
  target.followRequests = target.followRequests || [];

  if (me.following.includes(target.username))
    return res.json({message:"ته له مخکې دا کارن تعقیبوې"});
  if (target.followRequests.includes(me.username))
    return res.json({message:"د فالو غوښتنه دې مخکې لېږلې ده"});

  target.followRequests.push(me.username);
  saveUsers(users);

  const items = readNotifications();
  items.push({
    id: crypto.randomUUID(),
    user: target.username,
    from: me.username,
    type: "follow",
    text: "تاسې ته یې د فالو غوښتنه ولېږله",
    date: new Date().toISOString(),
    read: false
  });
  saveNotifications(items);

  res.json({message:"د فالو غوښتنه ولېږل شوه"});
});

app.post("/api/unfollow/:username", requireAuth, (req, res) => {
  const users = readUsers();
  const me = users.find(u => u.username === req.username);
  const target = users.find(u => u.username.toLowerCase() === String(req.params.username || "").toLowerCase());
  if (!target) return res.status(404).json({message:"کارن ونه موندل شو"});

  me.following = (me.following || []).filter(n => n !== target.username);
  target.followers = (target.followers || []).filter(n => n !== me.username);
  saveUsers(users);
  res.json({message:"تعقیب دې پرېښود"});
});

app.get("/api/follow-requests", requireAuth, (req, res) => {
  const users = readUsers();
  const me = users.find(u => u.username === req.username);
  if (!me) return res.status(401).json({message:"حساب ونه موندل شو"});
  const requests = (me.followRequests || []).map(name => ({username:name}));
  res.json(requests);
});

app.post("/api/follow-requests/:username/accept", requireAuth, (req, res) => {
  const users = readUsers();
  const me = users.find(u => u.username === req.username);
  const requester = users.find(u => u.username.toLowerCase() === String(req.params.username || "").toLowerCase());
  if (!me || !requester) return res.status(404).json({message:"کارن ونه موندل شو"});

  me.followRequests = me.followRequests || [];
  if (!me.followRequests.includes(requester.username))
    return res.status(404).json({message:"غوښتنه ونه موندل شوه"});

  me.followRequests = me.followRequests.filter(n => n !== requester.username);
  me.followers = me.followers || [];
  requester.following = requester.following || [];
  if (!me.followers.includes(requester.username)) me.followers.push(requester.username);
  if (!requester.following.includes(me.username)) requester.following.push(me.username);
  saveUsers(users);
  res.json({message:"د فالو غوښتنه ومنل شوه"});
});

app.post("/api/follow-requests/:username/reject", requireAuth, (req, res) => {
  const users = readUsers();
  const me = users.find(u => u.username === req.username);
  if (!me) return res.status(401).json({message:"حساب ونه موندل شو"});
  me.followRequests = me.followRequests || [];
  const before = me.followRequests.length;
  me.followRequests = me.followRequests.filter(n => n.toLowerCase() !== String(req.params.username || "").toLowerCase());
  if (before === me.followRequests.length)
    return res.status(404).json({message:"غوښتنه ونه موندل شوه"});
  saveUsers(users);
  res.json({message:"د فالو غوښتنه رد شوه"});
});

app.get("/api/users", requireAuth, (req, res) => {
  const allUsers = readUsers();
  const me = allUsers.find(u => u.username === req.username);
  if (!me) return res.status(401).json({message:"حساب ونه موندل شو"});
  const users = allUsers.map(u => ({
    username: u.username,
    avatar: u.avatar || "",
    followers: (u.followers || []).length,
    following: (u.following || []).length,
    isFollowing: (me.following || []).includes(u.username),
    requestSent: (u.followRequests || []).includes(me.username),
    isMe: u.username === me.username
  }));
  res.json(users);
});

app.get("/api/users/:username/profile", requireAuth, (req, res) => {
  const allUsers = readUsers();
  const me = allUsers.find(u => u.username === req.username);
  const target = allUsers.find(u => u.username.toLowerCase() === String(req.params.username || "").toLowerCase());
  if (!me) return res.status(401).json({message:"حساب ونه موندل شو"});
  if (!target) return res.status(404).json({message:"کارن ونه موندل شو"});
  const videos = readVideos().filter(v => v.owner === target.username);
  res.json({
    username: target.username,
    avatar: target.avatar || "",
    followers: (target.followers || []).length,
    following: (target.following || []).length,
    isMe: target.username === me.username,
    isFollowing: (me.following || []).includes(target.username),
    requestSent: (target.followRequests || []).includes(me.username),
    videos
  });
});

app.get("/api/my-videos", requireAuth, (req, res) => {
  res.json(readVideos().filter(v => v.owner === req.username));
});

app.get("/api/videos", (req, res) => {
  const videos = readVideos().map(video => {
    const { viewedBy, likedBy, ...publicVideo } = video;

    return {
      ...publicVideo,
      comments: Array.isArray(video.comments)
        ? video.comments.map(comment => {
            const { likedBy, ...publicComment } = comment;

            return {
              ...publicComment,
              replies: Array.isArray(comment.replies)
                ? comment.replies.map(reply => {
                    const { likedBy, viewedBy, ...publicReply } = reply;
                    return publicReply;
                  })
                : []
            };
          })
        : []
    };
  });

  res.json(videos);
});

app.post("/api/videos/:name/view", requireAuth, (req, res) => {
  const videos = readVideos();
  const video = videos.find(v => v.name === req.params.name);

  if (!video) return res.status(404).json({ message: "ویډیو ونه موندل شوه" });

  if (!Array.isArray(video.viewedBy)) video.viewedBy = [];

  if (!video.viewedBy.includes(req.username)) {
    video.viewedBy.push(req.username);
    video.views = Number(video.views || 0) + 1;
    saveVideos(videos);
  }

  res.json({ views: Number(video.views || 0) });
});

app.post("/api/videos/:name/like", requireAuth, (req, res) => {
  const videos = readVideos();
  const video = videos.find(v => v.name === req.params.name);

  if (!video) return res.status(404).json({ message: "ویډیو ونه موندل شوه" });

  if (!Array.isArray(video.likedBy)) video.likedBy = [];

  const username = req.username;
  const alreadyLiked = video.likedBy.includes(username);

  if (alreadyLiked) {
    video.likedBy = video.likedBy.filter(user => user !== username);
  } else {
    video.likedBy.push(username);
  }

  video.likes = Number(video.likes || 0) + (alreadyLiked ? -1 : 1);
  if (video.likes < 0) video.likes = 0;

  saveVideos(videos);

  if (!alreadyLiked && video.owner && username !== video.owner) {
    const items = readNotifications();
    items.push({
      id: crypto.randomUUID(),
      user: video.owner,
      from: username,
      type: "like",
      text: "ستاسې ویډیو یې خوښه کړه",
      videoName: video.name,
      date: new Date().toISOString(),
      read: false
    });
    saveNotifications(items);
  }

  res.json({ likes: video.likes, liked: !alreadyLiked });
});

app.post("/api/videos/:name/comment", requireAuth, (req, res) => {
  const videos = readVideos();
  const video = videos.find(v => v.name === req.params.name);
  if (!video) return res.status(404).json({ message: "ویډیو ونه موندل شوه" });

  const comment = String(req.body.comment || "").trim();
  if (!comment) return res.status(400).json({ message: "تبصره تشه ده" });
  if (comment.length > 500) return res.status(400).json({ message: "تبصره ډېره اوږده ده" });

  if (!Array.isArray(video.comments)) video.comments = [];
  const item = { text: comment, owner: req.username, date: new Date().toISOString() };
  video.comments.push(item);
  saveVideos(videos);

  if (video.owner && req.username !== video.owner) {
    const items = readNotifications();
    items.push({
      id: crypto.randomUUID(),
      user: video.owner,
      from: req.username,
      type: "comment",
      text: "ستاسې په ویډیو یې تبصره وکړه",
      videoName: video.name,
      comment: comment,
      date: new Date().toISOString(),
      read: false
    });
    saveNotifications(items);
  }

  res.json({ message: "تبصره ثبت شوه", comment: item });
});


app.delete("/api/videos/:name/comment/:index", requireAuth, (req, res) => {
  const videos = readVideos();
  const video = videos.find(v => v.name === req.params.name);
  if (!video) return res.status(404).json({message:"ویډیو ونه موندل شوه"});

  const index = Number(req.params.index);
  if (!Number.isInteger(index) || index < 0 || index >= (video.comments || []).length) {
    return res.status(404).json({message:"تبصره ونه موندل شوه"});
  }

  if (video.comments[index].owner !== req.username) {
    return res.status(403).json({message:"یوازې خپله تبصره حذفولی شې"});
  }

  video.comments.splice(index, 1);
  saveVideos(videos);
  res.json({message:"تبصره حذف شوه"});
});

app.put("/api/videos/:name/comment/:index", requireAuth, (req, res) => {
  const videos = readVideos();
  const video = videos.find(v => v.name === req.params.name);
  if (!video) return res.status(404).json({message:"ویډیو ونه موندل شوه"});

  const index = Number(req.params.index);
  if (!Number.isInteger(index) || index < 0 || index >= (video.comments || []).length) {
    return res.status(404).json({message:"تبصره ونه موندل شوه"});
  }

  const comment = video.comments[index];
  if (comment.owner !== req.username) {
    return res.status(403).json({message:"یوازې خپله تبصره سمولی شې"});
  }

  const text = String(req.body.comment || "").trim();
  if (!text) return res.status(400).json({message:"تبصره تشه ده"});
  if (text.length > 500) return res.status(400).json({message:"تبصره ډېره اوږده ده"});

  comment.text = text;
  comment.edited = true;
  saveVideos(videos);
  res.json({message:"تبصره سمه شوه", comment});
});

app.post("/api/videos/:name/comment/:index/like", requireAuth, (req, res) => {
  const videos = readVideos();
  const video = videos.find(v => v.name === req.params.name);
  if (!video) return res.status(404).json({message:"ویډیو ونه موندل شوه"});

  const index = Number(req.params.index);
  if (!Number.isInteger(index) || index < 0 || index >= (video.comments || []).length) {
    return res.status(404).json({message:"تبصره ونه موندل شوه"});
  }

  const comment = video.comments[index];

  if (!Array.isArray(comment.likedBy)) comment.likedBy = [];

  const username = req.username;
  const alreadyLiked = comment.likedBy.includes(username);

  if (alreadyLiked) {
    comment.likedBy = comment.likedBy.filter(user => user !== username);
  } else {
    comment.likedBy.push(username);
  }

  comment.likes = comment.likedBy.length;
  saveVideos(videos);

  res.json({
    message: alreadyLiked ? "خوښونه لرې شوه" : "تبصره خوښه شوه",
    likes: comment.likes,
    liked: !alreadyLiked
  });
});

app.post("/api/videos/:name/comment/:index/reply", requireAuth, (req, res) => {
  const videos = readVideos();
  const video = videos.find(v => v.name === req.params.name);
  if (!video) return res.status(404).json({message:"ویډیو ونه موندل شوه"});

  const index = Number(req.params.index);
  if (!Number.isInteger(index) || index < 0 || index >= (video.comments || []).length) {
    return res.status(404).json({message:"تبصره ونه موندل شوه"});
  }

  const reply = String(req.body.reply || "").trim();
  if (!reply) return res.status(400).json({message:"ځواب تش دی"});
  if (reply.length > 500) return res.status(400).json({message:"ځواب ډېر اوږد دی"});

  const comment = video.comments[index];
  if (!Array.isArray(comment.replies)) comment.replies = [];
  const item = {text:reply, owner:req.username || "PATANG", date:new Date().toISOString()};
  comment.replies.push(item);
  saveVideos(videos);
  res.json({message:"ځواب ثبت شو", reply:item});
});


app.get("/api/notifications", requireAuth, (req, res) => {
  const items = readNotifications()
    .filter(n => n.user === req.username)
    .sort((a, b) => new Date(b.date) - new Date(a.date));
  res.json(items);
});

app.post("/api/notifications/read", requireAuth, (req, res) => {
  const items = readNotifications();
  items.forEach(n => {
    if (n.user === req.username) n.read = true;
  });
  saveNotifications(items);
  res.json({message:"خبرتیاوې ولوستل شوې"});
});

app.get("/api/messages/unread-count", requireAuth, (req, res) => {
  const username = String(req.username || "").toLowerCase();
  const count = readMessages().filter(m =>
    String(m.to || "").toLowerCase() === username && m.read !== true
  ).length;
  res.json({count});
});

app.get("/api/messages/:username", requireAuth, (req, res) => {
  const target = String(req.params.username || "");
  const users = readUsers();
  if (!users.some(u => u.username.toLowerCase() === target.toLowerCase())) {
    return res.status(404).json({message:"کارن ونه موندل شو"});
  }

  const messages = readMessages().filter(m =>
    (m.from === req.username && m.to.toLowerCase() === target.toLowerCase()) ||
    (m.to === req.username && m.from.toLowerCase() === target.toLowerCase())
  );
  res.json(messages);
});

app.post("/api/messages/:username/read", requireAuth, (req, res) => {
  const target = String(req.params.username || "").toLowerCase();
  const users = readUsers();
  if (!users.some(u => u.username.toLowerCase() === target)) {
    return res.status(404).json({message:"کارن ونه موندل شو"});
  }

  const messages = readMessages();
  let changed = 0;
  messages.forEach(m => {
    if (
      m.to.toLowerCase() === req.username.toLowerCase() &&
      m.from.toLowerCase() === target &&
      m.read !== true
    ) {
      m.read = true;
      changed++;
    }
  });
  saveMessages(messages);
  res.json({message:"پیغامونه ولوستل شول", changed});
});

app.post("/api/messages/:username", requireAuth, (req, res) => {
  const target = String(req.params.username || "");
  const users = readUsers();
  const recipient = users.find(u => u.username.toLowerCase() === target.toLowerCase());

  if (!recipient) return res.status(404).json({message:"کارن ونه موندل شو"});
  if (recipient.username === req.username) {
    return res.status(400).json({message:"خپل ځان ته پیغام نه شې لېږلی"});
  }

  const text = String(req.body.text || "").trim();
  if (!text) return res.status(400).json({message:"پیغام تش دی"});
  if (text.length > 1000) return res.status(400).json({message:"پیغام ډېر اوږد دی"});

  const messages = readMessages();
  const message = {
    id: crypto.randomUUID(),
    from: req.username,
    to: recipient.username,
    text,
    date: new Date().toISOString()
  };

  messages.push(message);
  saveMessages(messages);

  const items = readNotifications();
  items.push({
    id: crypto.randomUUID(),
    user: recipient.username,
    from: req.username,
    type: "message",
    text: "تاسې ته یې شخصي پیغام ولېږه",
    date: new Date().toISOString(),
    read: false
  });
  saveNotifications(items);

  res.json({message:"پیغام ولېږل شو", data:message});
});

app.delete("/api/videos/:name", requireAuth, (req, res) => {
  const videos = readVideos();
  const index = videos.findIndex(v => v.name === req.params.name);

  if (index === -1) {
    return res.status(404).json({ message: "ویډیو ونه موندل شوه" });
  }

  const video = videos[index];

  const account = readUsers().find(u => u.username === req.username);
  if (video.owner !== req.username && account?.role !== "admin") {
    return res.status(403).json({ message: "یوازې د ویډیو خاوند یا اډمین یې حذفولی شي" });
  }

  const safeName = path.basename(video.name);
  if (safeName !== video.name) {
    return res.status(400).json({ message: "د ویډیو نوم ناسم دی" });
  }

  const videoPath = path.join(VIDEO_DIR, safeName);

  try {
    if (fs.existsSync(videoPath)) fs.unlinkSync(videoPath);
    videos.splice(index, 1);
    saveVideos(videos);
    if (account?.role === "admin") saveAdminLog(req.username, "ویډیو حذف", safeName);
    res.json({ message: "ویډیو په بریالیتوب حذف شوه" });
  } catch (error) {
    res.status(500).json({ message: "ویډیو حذف نه شوه" });
  }
});


function requireAdmin(req, res, next) {
  const user = readUsers().find(u => u.username === req.username);
  if (!user || user.role !== "admin") {
    return res.status(403).json({ message: "یوازې اډمین دې برخې ته لاسرسی لري" });
  }
  next();
}


function readReports() {
  const file = path.join(DATA_DIR, "reports.json");
  if (!fs.existsSync(file)) fs.writeFileSync(file, "[]");
  return JSON.parse(fs.readFileSync(file, "utf8") || "[]");
}

function saveReports(reports) {
  writeJsonAtomically(path.join(DATA_DIR, "reports.json"), reports);
}

app.post("/api/reports", requireAuth, (req, res) => {
  const videoName = String(req.body.videoName || "");
  const reason = String(req.body.reason || "");
  const details = String(req.body.details || "").trim().slice(0, 300);
  const allowedReasons = ["ځورونه", "سپکاوی", "ناسم معلومات", "سپم یا جعلي محتوا", "نور"];

  if (!videoName || videoName !== path.basename(videoName)) {
    return res.status(400).json({ message: "د ویډیو نوم ناسم دی" });
  }
  if (!allowedReasons.includes(reason)) {
    return res.status(400).json({ message: "د راپور دلیل وټاکه" });
  }

  const video = readVideos().find(v => v.name === videoName);
  if (!video) return res.status(404).json({ message: "ویډیو ونه موندل شوه" });
  if (video.owner === req.username) {
    return res.status(400).json({ message: "د خپلې ویډیو راپور نه شې ثبتولی" });
  }

  const reports = readReports();
  if (reports.some(r => r.videoName === videoName && r.reporter === req.username)) {
    return res.status(409).json({ message: "تا د دې ویډیو راپور مخکې ثبت کړی دی" });
  }

  const report = {
    id: crypto.randomUUID(),
    reporter: req.username,
    videoName,
    videoOwner: video.owner || "",
    caption: String(video.caption || "").slice(0, 500),
    reason,
    details,
    status: "new",
    createdAt: new Date().toISOString()
  };
  reports.unshift(report);
  saveReports(reports);
  res.json({ message: "راپور ثبت شو؛ مننه", reportId: report.id });
});

app.get("/api/admin/reports", requireAuth, requireAdmin, (req, res) => {
  res.json(readReports().slice(0, 200));
});

app.patch("/api/admin/reports/:id", requireAuth, requireAdmin, (req, res) => {
  const status = String(req.body.status || "");
  if (!["reviewed", "dismissed"].includes(status)) {
    return res.status(400).json({ message: "د راپور حالت ناسم دی" });
  }
  const reports = readReports();
  const report = reports.find(r => r.id === req.params.id);
  if (!report) return res.status(404).json({ message: "راپور ونه موندل شو" });

  report.status = status;
  report.reviewedBy = req.username;
  report.reviewedAt = new Date().toISOString();
  saveReports(reports);
  saveAdminLog(req.username, status === "reviewed" ? "راپور وکتل شو" : "راپور رد شو", report.videoName);
  res.json({ message: "د راپور حالت بدل شو", report });
});


app.patch("/api/admin/users/:username/password", requireAuth, requireAdmin, (req, res) => {
  const targetName = String(req.params.username || "");
  const newPassword = String(req.body.newPassword || "");

  if (newPassword.length < 8) {
    return res.status(400).json({ message: "نوی رمز لږ تر لږه ۸ توري ولري" });
  }

  const users = readUsers();
  const target = users.find(u => u.username.toLowerCase() === targetName.toLowerCase());

  if (!target) return res.status(404).json({ message: "کارن ونه موندل شو" });
  if (target.role === "admin") {
    return res.status(403).json({ message: "د اډمین رمز له دې لارې نه شي بدل کېدای" });
  }

  const salt = crypto.randomBytes(16).toString("hex");
  target.salt = salt;
  target.passwordHash = hashPassword(newPassword, salt);
  saveUsers(users);

  for (const [token, session] of sessions.entries()) {
    if (session.username.toLowerCase() === target.username.toLowerCase()) {
      sessions.delete(token);
    }
  }

  saveAdminLog(req.username, "د کارن رمز بدلول", target.username);
  res.json({ message: "د کارن نوی رمز ثبت شو؛ هغه به بیا ننوتل کوي", username: target.username });
});

app.delete("/api/admin/users/:username", requireAuth, requireAdmin, (req, res) => {
  const targetName = String(req.params.username || "");
  if (targetName.toLowerCase() === req.username.toLowerCase()) {
    return res.status(400).json({ message: "اډمین خپل حساب نه شي حذفولی" });
  }

  const users = readUsers();
  const originalUsers = JSON.parse(JSON.stringify(users));
  const index = users.findIndex(u => u.username.toLowerCase() === targetName.toLowerCase());
  if (index === -1) return res.status(404).json({ message: "کارن ونه موندل شو" });
  if (users[index].role === "admin") {
    return res.status(403).json({ message: "د بل اډمین حساب نه شي حذف کېدای" });
  }

  const username = users[index].username;
  const matchesUser = value => {
    if (typeof value === "string") return value.toLowerCase() === username.toLowerCase();
    if (value && typeof value === "object") {
      return [value.username, value.from].some(
        name => typeof name === "string" && name.toLowerCase() === username.toLowerCase()
      );
    }
    return false;
  };

  users.splice(index, 1);

  for (const user of users) {
    for (const field of ["following", "followers", "followRequests"]) {
      if (Array.isArray(user[field])) {
        user[field] = user[field].filter(item => !matchesUser(item));
      }
    }
  }

  const originalVideos = readVideos();
  const videos = cleanDeletedUserFromVideos(
    JSON.parse(JSON.stringify(originalVideos)), username
  );

  const originalMessages = readMessages();
  const messages = originalMessages.filter(
    message => !matchesUser(message.from) && !matchesUser(message.to)
  );

  const originalNotifications = readNotifications();
  const notifications = originalNotifications.filter(
    notification => !matchesUser(notification.user) && !matchesUser(notification.from)
  );

  try {
    saveUsers(users);
    saveMessages(messages);
    saveNotifications(notifications);
    saveVideos(videos);
  } catch (error) {
    const rollbackErrors = [];

    try { saveUsers(originalUsers); }
    catch (rollbackError) { rollbackErrors.push("users"); }

    try { saveMessages(originalMessages); }
    catch (rollbackError) { rollbackErrors.push("messages"); }

    try { saveNotifications(originalNotifications); }
    catch (rollbackError) { rollbackErrors.push("notifications"); }

    try { saveVideos(originalVideos); }
    catch (rollbackError) { rollbackErrors.push("videos"); }

    console.error(
      "Account deletion failed; rollback failures:",
      rollbackErrors.join(", ") || "none"
    );

    return res.status(500).json({
      message: rollbackErrors.length
        ? "د حساب حذف ناکام شو؛ د معلوماتو بېرته ساتلو کې هم ستونزه رامنځته شوه"
        : "د حساب حذف ناکام شو؛ پخواني معلومات بېرته وساتل شول"
    });
  }

  for (const [token, session] of sessions.entries()) {
    if (session.username.toLowerCase() === username.toLowerCase()) {
      sessions.delete(token);
    }
  }

  try {
    saveAdminLog(req.username, "کارن حذف", username);
  } catch (error) {
    console.error("Account deletion succeeded, but admin log could not be saved:", error.message);
  }

  res.json({
    message: "حساب، اړیکې، پیغامونه، خبرتیاوې او د هغه تبصرې او ځوابونه پاک شول؛ ویډیوګانې او راپورونه ساتل شوي",
    username
  });
});

app.patch("/api/admin/users/:username/status", requireAuth, requireAdmin, (req, res) => {
  const targetName = String(req.params.username || "");
  const blocked = req.body.blocked;
  if (typeof blocked !== "boolean") {
    return res.status(400).json({ message: "د حساب حالت ناسم دی" });
  }
  if (targetName.toLowerCase() === req.username.toLowerCase()) {
    return res.status(400).json({ message: "اډمین خپل حساب نه شي بندولی" });
  }

  const users = readUsers();
  const target = users.find(u => u.username.toLowerCase() === targetName.toLowerCase());
  if (!target) return res.status(404).json({ message: "کارن ونه موندل شو" });
  if (target.role === "admin") {
    return res.status(403).json({ message: "د بل اډمین حساب نه شي بدلول کېدای" });
  }

  target.blocked = blocked;
  saveUsers(users);

  if (blocked) {
    for (const [token, session] of sessions.entries()) {
      if (session.username.toLowerCase() === target.username.toLowerCase()) {
        sessions.delete(token);
      }
    }
  }

  saveAdminLog(req.username, blocked ? "حساب بندول" : "حساب فعالول", target.username);
  res.json({ message: blocked ? "حساب بند شو" : "حساب بېرته فعال شو", username: target.username, blocked });
});

app.get("/api/admin/overview", requireAuth, requireAdmin, (req, res) => {
  const users = readUsers();
  const videos = readVideos();

  res.json({
    userCount: users.length,
    activeUserCount: users.filter(u => u.blocked !== true).length,
    blockedUserCount: users.filter(u => u.blocked === true).length,
    videoCount: videos.length,
    totalLikes: videos.reduce((sum, v) => sum + (Number(v.likes) || 0), 0),
    totalViews: videos.reduce((sum, v) => sum + (Number(v.views) || 0), 0),
    users: users.map(u => ({
      username: u.username,
      role: u.role || "user",
      blocked: u.blocked === true,
      createdAt: u.createdAt || ""
    })),
    videos: videos.map(v => ({
      name: v.name,
      owner: v.owner || "",
      caption: v.caption || "",
      date: v.date || "",
      likes: Number(v.likes) || 0,
      views: Number(v.views) || 0
    }))
  });
});

app.get("/api/admin/logs", requireAuth, requireAdmin, (req, res) => {
  const logs = readAdminLogs();
  res.json(logs.slice(0, 100));
});

app.delete("/api/admin/logs", requireAuth, requireAdmin, (req, res) => {
  saveAdminLogs([]);
  res.json({ message: "د فعالیتونو تاریخچه پاکه شوه" });
});

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);

  if (err.type === "entity.too.large") {
    return res.status(413).json({ message: "غوښتل شوي معلومات ډېر لوی دي" });
  }

  console.error("Server request error:", err.message);
  return res.status(500).json({ message: "په سرور کې ستونزه رامنځته شوه" });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log("PATANG TIK Server started on port " + PORT);
});
