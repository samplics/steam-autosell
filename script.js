const TradeOfferManager = require('steam-tradeoffer-manager');
let SteamCommunity = require('steamcommunity');
const SteamUser = require('steam-user');
const request = require('request');
const fetch = require('node-fetch');
var fs = require('fs');
const readline = require("readline");
const path = require('path');
const rp = require('request-promise');
const perf = require('execution-time')();
const colors = require('colors')

var client = new SteamUser();
const axios = require("axios");
const qs = require('querystring');
let steamTotp = require('steam-totp');
let community = new SteamCommunity();

const directoryPath = path.join(__dirname, 'configs');
configs = [];

fs.readdir(directoryPath, function(err, files) {
  if (err) {
    return console.log('Unable to scan directory: ' + err);
  }
  let i = 0;
  files.forEach(function(file) {
    configs.push(`${file}`);
    console.log(`${i} - ${configs[i]}`);
    i++;
  });
});

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

setTimeout(function() {
  rl.question("\nType the number corresponding with the config you wish to load.\n", function(num) {
    console.log(`You picked config number ${num}, which is ${configs[num]}.`);
    rl.close();
    const config = require(`./configs/${configs[num]}`);
    const blacklist = require(`./blacklist.json`);

    let manager = new TradeOfferManager({
      "steam": client,
      "language": "en",
      'domain': 'localhost',
      "pollInterval": 100
    });

    client.logOn({
      "accountName": config.username,
      "password": config.password,
      "twoFactorCode": steamTotp.generateAuthCode(config.secret)
    });

    client.on('loggedOn', function(details) {
      client.on('accountInfo', function(name) {
        console.log(colors.green(`\n-------------------------------------\nWelcome to Sampli's Steam Market Speed Demon \nAuthor: Sampli#4731 \n-------------------------------------\nInformation\n-------------------------------------\n[STEAM] Config Chosen: ${colors.red(`${configs[num]}`)}\n[CONFIG] Blacklisted SteamIDs: ${colors.red(`${blacklist.steamID}`)}\n[STEAM] Market: ${colors.red(`${'ONLINE'}`)}\n[CHECKER] No Error Messages: ${colors.red(`${'TRUE'}`)}\n-------------------------------------\n`))
        console.log("Logged into Steam as " + name + " | " + name + "\'s Steam ID64: " + client.steamID.getSteamID64());
      });
    });

    client.on('error', function(e) {
      console.log(e);
    });


    ///  start functions
    function sellItem(name, appID, assetID, contextID, price, sessionID, cookies) {
      var newPrice = (price * 100) + 2000;

      request({
        url: 'https://steamcommunity.com/market/sellitem/',
        method: 'POST',
        headers: {
          'Connection': 'keep-alive',
          'Accept': '*/*',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/81.0.4044.129 Safari/537.36',
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'Origin': 'https://steamcommunity.com',
          'Sec-Fetch-Site': 'same-origin',
          'Sec-Fetch-Mode': 'cors',
          'Sec-Fetch-Dest': 'empty',
          'Referer': 'https://steamcommunity.com/profiles/' + client.steamID.getSteamID64() + '/inventory/',
          'Accept-Language': 'en-GB,en-US;q=0.9,en;q=0.8',
          'Cookie': cookies
        },
        body: `sessionid=${sessionID}&appid=${appID}&contextid=${contextID}&assetid=${assetID}&amount=1&price=${newPrice}`
      }, function(err, res, body) {
        if (err) throw err;
        community.checkConfirmations()
        var oldPrice = ((newPrice - 2000) / 100) + 20;
        body = JSON.stringify(body);
        if(body.includes('message')){
          body = body.replace(`"{\\"success\\":false,\\"message\\":\\"`,``).replace(`\\"}"`, ``);
          console.log(`Item ${name} failed to list to the market because "${body}"`);
        } else{
          console.log(`Item ${name} successfully listed on the market for $${oldPrice}.`)
          console.timeEnd('It took');
        }
      });
    }

    function getItemPrice(appid, name){
      var lowestPrice;

      return new Promise(function(resolve, reject){
        community.getMarketItem(appid, name, async function(err, item) {
          if(err) throw err;
          lowestPrice = item.lowestPrice;
          resolve(lowestPrice);
        })
      })
    }

    async function acceptItem(offer, sessionID, cookies){
      var lowestPrice = await getItemPrice(offer.itemsToReceive[0].appid, offer.itemsToReceive[0].market_hash_name)
      .then(offer.accept(function(err, status) {
        if(err) throw err;
        console.time('It took');
        community.startConfirmationChecker(15000, config.identity);
        if (err) {
          console.log("Unable to accept offer: " + err.message);
        } else {
          offer.getReceivedItems(function(err, items) {
            if(err) throw err;
            console.time("It took this time to accept the offer and list the item");
            console.log("Offer Status: " + status);
            sellItem(items[0].name, items[0].appid, items[0].assetid, items[0].contextid, lowestPrice, sessionID, cookies);
          });
        }
      }))
    }

    async function acceptBundle(offer, sessionID, cookies){
      var prices = [];
      offer.itemsToReceive.forEach(async function(item){
        prices.push(await getItemPrice(item.appid, item.market_hash_name))
      })
      setTimeout(function () {
        offer.accept(function(err, status) {
          if(err) throw err;
          console.log("Offer Status: " + status);
          console.time('It took');
          community.startConfirmationChecker(15000, config.identity);
          if (err) {
            console.log("Unable to accept offer: " + err.message);
          } else {
            offer.getReceivedItems(async function(err, items) {
              if(err) throw err;
              for(let i=0;i<offer.itemsToReceive.length;i++){
                await sellItem(items[i].name, items[i].appid, items[i].assetid, items[i].contextid, prices[i], sessionID, cookies);
              }
            });
          }
        })
      }, 1500);
    }

    var isCrashed;

    function checkInventory(){
      fetch(`https://steamcommunity.com/inventory/${client.steamID.getSteamID64()}/730/2?l=english&count=10`, {
        method: 'get',
        headers: {
          "accept": "*/*",
          "accept-language": "en-US,en;q=0.9",
          "sec-fetch-dest": "empty",
          "sec-fetch-mode": "cors",
          "sec-fetch-site": "same-origin",
          "x-requested-with": "XMLHttpRequest"
        },
        referrer: "https://steamcommunity.com/profiles/"+client.steamID.getSteamID64()+"/inventory/",
      })
      .then(res => res.json())
      .then((data)=>{
        if('error' in data){
          console.log(data);
          isCrashed = true;
        } else{
          isCrashed = false;
        }
      })
    }

    /// end functions


    client.on('webSession', function(sessionID, cookies) {
      console.log('Found Session ID and Cookies');
      manager.setCookies(cookies, function(err) {
        if (err) {
          console.log(err);
          process.exit(1);
          return;
        }
      });
      community.setCookies(cookies);
      manager.on('newOffer', function(offer, steamID) {
        if(offer.partner.getSteamID64() == blacklist.steamID){
          console.log(`${colors.green('Offer left for manual review:')} The Users SteamID64 is blacklisted (${blacklist.steamID}).`)
        } else if (offer.itemsToGive.length > 0) {
          console.log(`${colors.green('Offer left for manual review:')} Offer is requesting our items.`);
        } else {
          var checked = 0;
          var checkInv = setInterval(function () {
            checkInventory();
            checked = checked + 1;
            if(isCrashed == true){
              console.log(`${colors.green('Offer being accepted:')} Inventory is crashed.`);
              if(offer.itemsToReceive.length > 1) {
                acceptBundle(offer, sessionID, cookies);
              } else {
                acceptItem(offer, sessionID, cookies);
              }
              clearInterval(checkInv);
            } else{
              if(checked % 10 === 0){
                console.log(`${colors.green('Checked inventory')} ${checked} times.`)
              }
            }
          }, 250);
        }
      });
    })
  })
}, 1000);
