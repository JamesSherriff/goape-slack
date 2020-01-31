const im = require('imagemagick');
const express = require('express')
const app = express()
const port = 3002
const request = require('request');
const moment = require('moment');
const util = require('util')
var bodyParser = require('body-parser');
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
const bookings_base_url = 'https://bookings.goape.co.uk/';
const base_url = 'localhost:3002';
const fs = require('fs');
var slack_token = "xoxp-912291827186-925100388469-918120196226-c66f95d1ccbf59a5204c6c008f4c9812";

app.post('/bookings', function(req, response) {
  handleBookingsRequest(req, response)
});
app.get('/bookings', function(req, response) {
  handleBookingsRequest(req, response)
});
app.get('/meme', function(req, response) {
  generateMeme(req, response);
});
app.get('/meme/generated', function(req, response) {
  serveMeme(req, response);
});
app.post('/meme', function(req, response) {
  generateMeme(req, response);
});
app.get('/meme/update', function(req, response) {
  updateMemes(req, response);
});

function updateMemes(req, response) {
  request_url = "https://slack.com/api/users.list?token=" + slack_token;
  request(request_url, {json: true}, (err, res, body) => {
    var names = [];
    if(body.members) {
      var members = body.members;
      for(var member in members) {
        if (members[member].profile) {
          name = members[member].profile.display_name || members[member].profile.real_name || "";
          image = members[member].profile.image_512 || "";
          request.head(image, downloadImage(err, res, body, name, image));
          names.push(name);
        }
      }
    }
    response.send("DONE! FOUND: " + names);
  });
}

function downloadImage(err, res, body, name, image) {
  request(image).pipe(fs.createWriteStream("images/memes/" + name + ".jpg")).on('close', function() {
    console.log("Downloaded - " + name);
  });
}

function generateMeme(req, response) {
  if (req.body.text) {
    var meme_type = req.body.text.split(" ")[0];
    var text = req.body.text.substring(meme_type.length + 1, req.body.text.length);
    var top_text = text.split(";")[0];
    var bottom_text = null;
    if (text.split(";").length > 1) {
      bottom_text = text.split(";")[1];
    }
  }
  else {
    var meme_type = req.query.type;
    var text = req.query.text;
    var top_text = text.split(";")[0];
    var bottom_text = null;
    if (text.split(";").length > 1) {
      bottom_text = text.split(";")[1];
    }
  }

  var meme_output_name = Date.now() + ".jpg";

  command_list = ['images/memes/' + meme_type + ".jpg", "-font", "fonts/impact.ttf", "-fill", "white", "-pointsize", "40", "-stroke", "black", "-strokewidth", "2", "-gravity", "north", "-annotate", "+0+0", top_text];
  if (bottom_text) {
    command_list.push('-gravity', 'south', '-annotate', '+0+0', bottom_text);
  }
  command_list.push('images/memes/generated/' + meme_output_name);
  console.log(command_list);
  im.convert(command_list, function(err, stdout) {
    if(err) throw err;
    if (req.body.text) {
      var response_data = {
        "attachments": [
          {
            "fallback": "Memey meme " + meme_output_name,
            "image_url": base_url + "/meme/generated?id=" + meme_output_name,
            "thumb_url": base_url + "/meme/generated?id=" + meme_output_name
          }
        ]
      }

      response.send(response_data);
    }
    else {
      fs.readFile('images/memes/generated/' + req.query.id, function(err, data) {
        if(err) throw err;
        response.set('Content-Type', 'image/jpeg');
        response.send(data);
      });
    }
  });
}

function serveMeme(req, response) {
  fs.readFile('images/memes/generated/' + req.query.id, function(err, data) {
    if(err) throw err;
    response.set('Content-Type', 'image/jpeg');
    response.send(data);
  });
}

function handleBookingsRequest(req, response) {
  var original_from_date = req.query.from_date;
  var original_to_date = req.query.to_date;
  var from_date = req.query.from_date || moment().format('YYYY-MM-DD');
  var to_date = req.query.to_date || moment().format('YYYY-MM-DD');
  var time = req.query.time;
  var site_name = req.query.site_name;
  if (!site_name && req.body.team_domain) {
    if(req.body.team_domain == "sherriffworkspace") {
      site_name = "CoombeAbbey";
    }
  } 
  var is_slack = req.body.user_id != null;
  var slack_text = req.body.text;
  if (slack_text) {
    // This is a slack request so we need to parse slack text params
    slack_params = slack_text.split(" ");
    if (slack_params[0]) {
      if (/^([0-9]{4}-[0-9]{2}-[0-9]{2})/.test(slack_params[0])) {
        from_date = slack_params[0];
        to_date = slack_params[0];
        original_from_date = slack_params[0];
        original_to_date = slack_params[0];
      }
      else {
        time = slack_params[0];
      }
    }
    if (slack_params[1] && /^([0-9]{4}-[0-9]{2}-[0-9]{2})/.test(slack_params[1])) {
      from_date = slack_params[1];
      to_date = slack_params[1]        
      original_from_date = slack_params[1];
      original_to_date = slack_params[1];
    }
  }

  var request_url = bookings_base_url + site_name + '/feed/eventsavailability?json&fromdate=' + from_date + '&todate=' + to_date;
  request(request_url, {json: true}, (err, res, body) => {
    

    if (err) { return console.log(err); }

    if(!body.feed) {
      // Send response that there are no events on today.
      response.send("There aren't any bookings for today.");
      return;
    }

    var event_types = [];

    for(event of body.feed.data.Events.Event) {
      event_type = event.NameAndDate.split(" - ")[0];
      if (!event_types.includes(event_type)) {
        event_types.push(event_type);
      }
    }

    event_type_events = {};

    for(event_type of event_types) {
      event_type_events[event_type] = 0;
    }

    for(event of body.feed.data.Events.Event) {
      if (time) {
        if (time.includes(":")) {
          var chosenMoment = moment();
          chosenMoment.hours(time.split(":")[0]);
          chosenMoment.minutes(time.split(":")[1]);
          if (moment(event.ActualEventDate).format('HH:mm') == chosenMoment.format('HH:mm')) {
            event_type_events[event.NameAndDate.split(" - ")[0]] += parseInt(event.SoldTickets);
          }
        }
        else {
          if (moment(event.ActualEventDate).hour() == time && moment(event.ActualEventDate).minutes() == 0) {
            event_type_events[event.NameAndDate.split(" - ")[0]] += parseInt(event.SoldTickets);
          }
        }
        
      }
      else {
        event_type_events[event.NameAndDate.split(" - ")[0]] += parseInt(event.SoldTickets);
      }
    }

    // Send response with names of events and stuff.
    if (is_slack) {
      date_time = "";
      if(original_to_date || original_from_date) {
        if (original_to_date) {
          date_time += "for " + original_to_date;
        }
        else {
          date_time += "for " + original_from_date;
        }
      }
      if (time) {
        if (date_time == "") {
          date_time += "at " + time;
        }
        else {
          date_time += " at " + time;
        }
      }
      if (date_time == "") {
        date_time = "today"
      }
      response_data = {
        "response_type": "in_channel",
        "blocks": [
          {
            "type": "section",
            "text": {
              "type": "mrkdwn",
              "text": "*These are the current bookings " + date_time + ":*"
            }
          }
        ]
      }

      for(event_type in event_type_events) {
        activity_data = {
          "type": "section",
          "text": {
            "type": "mrkdwn",
            "text": "*" + event_type + "*: " + event_type_events[event_type]
          }
        }
        response_data["blocks"].push(activity_data);
      }
      response.send(response_data);
    }
    else {
      response.send(event_type_events);
    }
  });
}

app.listen(port, () => console.log(`Go Ape Slack listening on port ${port}!`))