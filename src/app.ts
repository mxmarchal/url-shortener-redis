import express from "express";
import winston from "winston";
import redis from "redis";
import { promisify } from "node:util";
import path from "node:path";

const client = redis.createClient(process.env.REDIS_URL);
const setAsync = promisify(client.set).bind(client);
const getAsync = promisify(client.get).bind(client);
const bgsaveAsync = promisify(client.bgsave).bind(client);

const idGenerator = (length: Number): String => {
  let result = "";
  const characters =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const charactersLength = characters.length;
  for (var i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
};
const validateUrl = (value: string): Boolean =>
  /^(?:(?:(?:https?|ftp):)?\/\/)(?:\S+(?::\S*)?@)?(?:(?!(?:10|127)(?:\.\d{1,3}){3})(?!(?:169\.254|192\.168)(?:\.\d{1,3}){2})(?!172\.(?:1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2})(?:[1-9]\d?|1\d\d|2[01]\d|22[0-3])(?:\.(?:1?\d{1,2}|2[0-4]\d|25[0-5])){2}(?:\.(?:[1-9]\d?|1\d\d|2[0-4]\d|25[0-4]))|(?:(?:[a-z\u00a1-\uffff0-9]-*)*[a-z\u00a1-\uffff0-9]+)(?:\.(?:[a-z\u00a1-\uffff0-9]-*)*[a-z\u00a1-\uffff0-9]+)*(?:\.(?:[a-z\u00a1-\uffff]{2,})))(?::\d{2,5})?(?:[/?#]\S*)?$/i.test(
    value
  );

const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp({
      format: "MMM-DD-YYYY HH:mm:ss",
    }),
    winston.format.json()
  ),
  defaultMeta: { service: "user-service" },
  transports: [
    new winston.transports.File({ filename: "error.log", level: "error" }),
    new winston.transports.File({ filename: "combined.log" }),
    new winston.transports.Console(),
  ],
});

const app = express();
const port = process.env.PORT || 8080;

app.use(
  express.urlencoded({
    extended: true,
  })
);
app.use(express.json());

app.get("/", async (req, res) => {
  res.sendFile(path.join(__dirname + "/index.html"));
});

app.get("/:id", async (req, res) => {
  const id = req.params.id;
  const getValue = await getAsync(id);

  if (!getValue) {
    res.status(404).send("No URL associated");
  } else {
    res.redirect(301, getValue);
  }
});

app.post("/addUrl", async (req, res) => {
  if (!req.body) {
    res.status(400).send("no body");
    return;
  }
  const { url } = req.body;

  if (!url) {
    res.status(400).send("url is not in body");
    return;
  }

  if (!validateUrl(url)) {
    res.status(400).send("URL is incorrect");
    return;
  }

  const getValue = await getAsync(url);
  if (getValue) {
    res.send({ urlCode: getValue });
    return;
  }

  const getId: String = idGenerator(5);
  await setAsync(url, getId);
  await setAsync(getId, url);

  logger.info(`New URL created: ${url} => ${getId}`);
  res.send({ urlCode: getId });
});

app.listen(port, () => {
  logger.info(`server started at http://localhost:${port}`);
});

setInterval(async () => {
  logger.info(`REDIS: Saving database...`);
  await bgsaveAsync();
}, 3000000);
