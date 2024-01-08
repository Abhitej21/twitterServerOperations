const express = require("express");
const app = express();
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
app.use(express.json());
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");
const dbPath = path.join(__dirname, "twitterClone.db");

let db = null;
const initializeDbAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server is running at http://localhost:3000");
    });
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
    process.exit(1);
  }
};

initializeDbAndServer();

const getList = async (username) => {
  const getQuery = `SELECT following_user_id FROM follower INNER JOIN user ON 
    user.user_id = follower.follower_user_id WHERE user.username='${username}';`;
  const list = await db.all(getQuery);
  //   console.log(list);
  const array = list.map((each) => each.following_user_id);
  return array;
};

const authenticateToken = (request, response, next) => {
  const { tweet } = request.body;
  const { tweetId } = request.params;
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "MY_SECRET_TOKEN", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.payload = payload;
        request.tweetId = tweetId;
        request.tweet = tweet;
        next();
      }
    });
  }
};

// API 1
app.post("/register", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'`;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const hashedPassword = await bcrypt.hash(password, 10);
      const createUserQuery = `
                INSERT INTO user(name,username,password,gender) VALUES
                ('${name}','${username}','${hashedPassword}','${gender}');
            `;
      await db.run(createUserQuery);
      response.status(200);
      response.send("User created successfully");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

// API 2
app.post("/login", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `SELECT * FROM user WHERE username='${username}'`;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched === true) {
      const jwtToken = jwt.sign(dbUser, "MY_SECRET_TOKEN");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

// API 3
app.get("/user/tweets/feed", authenticateToken, async (request, response) => {
  const { payload } = request;
  const { user_id, name, username, gender } = payload;
  const list = await getList(username);
  console.log(username);
  const getListQuery = `SELECT username,tweet,date_time as dateTime FROM user INNER JOIN 
  tweet ON user.user_id=tweet.user_id WHERE user.user_id IN (${list}) 
  ORDER BY date_time DESC LIMIT 4;`;
  //   const getTweetsFeedQuery = `
  //         SELECT username,tweet,date_time as dateTime FROM
  //         follower INNER JOIN tweet ON follower.following_user_id = tweet.user_id
  //         INNER JOIN user ON user.user_id = follower.following_user_id
  //         WHERE follower.follower_user_id = ${user_id}
  //         ORDER BY date_time DESC LIMIT 4;
  //     `;
  const tweetFeedArray = await db.all(getListQuery);
  response.send(tweetFeedArray);
});

// API 4
app.get("/user/following", authenticateToken, async (request, response) => {
  const { payload } = request;
  const { user_id, name, username, gender } = payload;
  const userFollowingQuery = `
        SELECT name FROM user INNER JOIN follower ON user.user_id = follower.following_user_id
        WHERE follower.follower_user_id = ${user_id};
    `;
  const userFollowsArray = await db.all(userFollowingQuery);
  response.send(userFollowsArray);
});

// API 5
app.get("/user/followers", authenticateToken, async (request, response) => {
  const { payload } = request;
  const { user_id, name, username, gender } = payload;
  const userFollowersQuery = `
        SELECT name FROM user INNER JOIN follower ON user.user_id = follower.follower_user_id
        WHERE follower.following_user_id = ${user_id};
    `;
  const userFollowersArray = await db.all(userFollowersQuery);
  response.send(userFollowersArray);
});

// API 6
app.get("/tweets/:tweetId", authenticateToken, async (request, response) => {
  const { tweetId } = request;
  const { payload } = request;
  const { user_id, name, username, gender } = payload;
  const tweetsQuery = `SELECT * FROM tweet WHERE tweet_id=${tweetId}`;
  const tweetsResult = await db.get(tweetsQuery);
  const userFollowersQuery = `
        SELECT * FROM follower INNER JOIN user ON user.user_id = follower.following_user_id
        WHERE follower.follower_user_id = ${user_id};
    `;
  const userFollowers = await db.all(userFollowersQuery);
  if (
    userFollowers.some(
      (item) => item.following_user_id === tweetsResult.user_id
    )
  ) {
    const getTweetDetailsQuery = `
            SELECT tweet,COUNT(DISTINCT(like.like_id)) AS likes,
            COUNT(DISTINCT(reply.reply_id)) AS replies,
            tweet.date_time AS dateTime
            FROM tweet INNER JOIN like ON tweet.tweet_id = like.tweet_id 
            INNER JOIN reply ON reply.tweet_id = tweet.tweet_id 
            WHERE tweet.tweet_id = ${tweetId} AND tweet.user_id=${userFollowers[0].user_id};
        `;

    const tweetDetails = await db.get(getTweetDetailsQuery);
    response.send(tweetDetails);
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});

// API 7
app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request;
    const { payload } = request;
    const { user_id, name, username, gender } = payload;
    const getLikedUsersQuery = `
    SELECT * FROM follower INNER JOIN tweet ON tweet.user_id = follower.following_user_id 
    INNER JOIN like ON like.tweet_id = tweet.tweet_id
    INNER JOIN user ON user.user_id = like.user_id
    WHERE tweet.tweet_id = ${tweetId} AND follower.follower_user_id = ${user_id};
    `;

    const likedUsers = await db.all(getLikedUsersQuery);
    if (likedUsers.length !== 0) {
      let likes = [];
      const getNamesArray = (likedUsers) => {
        for (let item of likedUsers) {
          likes.push(item.username);
        }
      };
      getNamesArray(likedUsers);
      response.send({ likes });
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

// API 8
app.get(
  "/tweets/:tweetId/replies",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request;
    const { payload } = request;
    const { user_id, name, username, gender } = payload;
    const getRepliedUserQuery = `
        SELECT * FROM follower INNER JOIN tweet ON tweet.user_id = follower.following_user_id 
        INNER JOIN reply ON reply.tweet_id = tweet.tweet_id
        INNER JOIN user ON user.user_id = reply.user_id
        WHERE tweet.tweet_id = ${tweetId} AND follower.follower_user_id=${user_id};
    `;
    const repliedUsers = await db.all(getRepliedUserQuery);
    if (repliedUsers.length !== 0) {
      let replies = [];
      const getNamesArray = (repliedUsers) => {
        for (let item of repliedUsers) {
          let object = {
            name: item.name,
            reply: item.reply,
          };
          replies.push(object);
        }
      };
      getNamesArray(repliedUsers);
      response.send({ replies });
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

// API 9
app.get("/user/tweets", authenticateToken, async (request, response) => {
  const { payload } = request;
  const { user_id, name, username, gender } = payload;
  const getTweetsDetailsQuery = `
        SELECT tweet.tweet as tweet,
        COUNT(DISTINCT(like.like_id)) AS likes,
        COUNT(DISTINCT(reply.reply_id)) AS replies,
        tweet.date_time AS dateTime
        FROM user INNER JOIN tweet ON user.user_id = tweet.user_id INNER JOIN like 
        ON like.tweet_id = tweet.tweet_id INNER JOIN reply ON reply.tweet_id = tweet.tweet_id
        WHERE user.user_id = ${user_id}
        GROUP BY tweet.tweet_id;
    `;
  const tweetDetails = await db.all(getTweetsDetailsQuery);
  response.send(tweetDetails);
});

//API 10
app.post("/user/tweets", authenticateToken, async (request, response) => {
  const { tweet } = request;
  const { tweetId } = request;
  const { payload } = request;
  const { user_id, name, username, gender } = payload;
  const postTweetQuery = `
        INSERT INTO tweet (tweet,user_id) VALUES ('${tweet}',${user_id});
    `;
  await db.run(postTweetQuery);
  response.send("Created a Tweet");
});
app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request;
    const { payload } = request;
    const { user_id, name, username, gender } = payload;
    const selectUserQuery = `SELECT * FROM tweet WHERE tweet.user_id = ${user_id} AND tweet.tweet_id=${tweetId}`;
    const tweetUser = await db.get(selectUserQuery);
    if (tweetUser !== undefined) {
      const deleteTweetQuery = `
            DELETE FROM tweet WHERE tweet.tweet_id=${tweetId};
        `;
      await db.run(deleteTweetQuery);
      response.send("Tweet Removed");
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

module.exports = app;
