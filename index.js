var request = require('request').defaults({ encoding: null });
var fs = require('fs');
var jsonfile = require('jsonfile');
var moment = require('moment');
var Jimp = require('jimp');
var Twit = require('twit');
var twitterConfig = require('./twitter-config');

console.log(Date());
var Bot = new Twit(twitterConfig);

var obj = JSON.parse(fs.readFileSync(__dirname + '/hillsofatl-index.json', 'utf8') || '{}');
var index = obj.index || 0;
var addresses = JSON.parse(fs.readFileSync(__dirname + '/atlanta-metro.json', 'utf8'));

index++;
var address = addresses[index];

var location = address.LAT + ',' + address.LON;
var street = address.NUMBER + ' ' + address.STREET;
request.get('https://maps.googleapis.com/maps/api/elevation/json?locations=' + location, function(error, response, body) {
  if (error) {
    console.error('error getting elevation data', error);
  } else {
    var data = JSON.parse(body.toString('utf-8'));
    var elevation = data.results[0].elevation;
    getImage(location, street, elevation);
  }
});

jsonfile.writeFile(__dirname + '/hillsofatl-index.json', { 'index': index }, { spaces: 2 }, function(err) {
  if (err) console.error('error saving index', err);
});

function getImage(location, street, elevation) {
  request.get('https://maps.googleapis.com/maps/api/streetview?size=600x400&location=' + location, function (error, response, body) {
    if (error) {
      console.error('error getting streetview image', error);
    } else {
      Jimp.read(new Buffer(body))
      .then(function(image) {
        var factor = (elevation / 320) * 400;
        if (factor > 400) factor = 400;
        var newImage = image.clone();
        for (var x = 0; x < image.bitmap.width; x++) {
          var level = 400 - factor;
          var y = (parseInt(Math.pow(x - (image.bitmap.width / 2), 2) / (.5625 * factor))) + level;
          if (y < image.bitmap.height && y >= 0) {
            image.scan(x, y, 1, image.bitmap.height - y, function(xx, yy, idx) {
              var cy = (yy - y);
              newImage.setPixelColor(image.getPixelColor(xx, cy), xx, yy);
            })
          }
        }

        newImage.getBuffer(Jimp.MIME_JPEG, function(err, buffer) {
          postToTwitter(buffer, street, elevation);
        });
        newImage.write('test.jpg')
      })
    }
  });
}

function postToTwitter(buffer, street, elevation) {
  Bot.post('media/upload', { media_data: new Buffer(buffer).toString('base64') }, function (err, data, response) {
    if (err) console.error('error uploading image to twitter', err);
    var mediaIdStr = data.media_id_string
    var meta_params = { media_id: mediaIdStr }

    Bot.post('media/metadata/create', meta_params, function (err, data, response) {
      if (err) {
        console.error('error creating metadata', err);
      } else {
        var status = street + '\nElevation: ' + parseInt(elevation * 3.2808) + 'ft.';
        console.log(status);
        // now we can reference the media and post a tweet (media will attach to the tweet) 
        var params = { status: status, media_ids: [mediaIdStr] }
   
        Bot.post('statuses/update', params, function (err, data, response) {
          if (err) console.error('error tweeting', err);
          else console.log('done tweeting');

        });
      }
    })
  })
}