const express = require('express')
const app = express()
const port = 3002
const request = require('request');
const moment = require('moment');
const bookings_base_url = 'https://bookings.goape.co.uk/';

app.post('/bookings', function(req, response) {
  handleBookingsRequest(req, response)
});
app.get('/bookings', function(req, response) {
  handleBookingsRequest(req, response)
});

function handleBookingsRequest(req, response) {
  var from_date = req.query.from_date || moment().format('YYYY-MM-DD');
  var to_date = req.query.to_date || moment().format('YYYY-MM-DD');
  var time = req.query.time;
  var site_name = req.query.site_name;
  var is_slack = req.query.user_id != null;

  var slack_text = req.query.text;
  if (slack_text) {
    // This is a slack request so we need to parse slack text params
    slack_params = slack_text.split(" ");
    if (slack_params[0]) {
      time = slack_params[0];
    }
    console.log(slack_params[1])
    if (slack_params[1] && /^([0-9]{4}-[0-9]{2}-[0-9]{2})/.test(slack_params[1])) {
      console.log("matched");
      from_date = slack_params[1];
      to_date = slack_params[1]
    }
  }

  var request_url = bookings_base_url + site_name + '/feed/eventsavailability?json&fromdate=' + from_date + '&todate=' + to_date;
  request(request_url, {json: true}, (err, res, body) => {
    

    if (err) { return console.log(err); }

    if(!body.feed) {
      if (body.head.warnings.feedempty) {
        // Send response that there are no events on today.
        response.send([]);
        return;
      }
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
    console.log(event_type_events);

    // Send response with names of events and stuff.
    if (is_slack) {
      response_data = {
        "blocks": [
          {
            "type": "section",
            "text": {
              "type": "mrkdwn",
              "text": "*These are the current bookings for today:*"
            }
          }
        ]
      }

      for(event_type in event_type_events) {
        activity_data = {
          "type": "section",
          "text": {
            "type": "mrkdwn",
            "text": "**" + event_type + "**: " + event_type_events[event_type]
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