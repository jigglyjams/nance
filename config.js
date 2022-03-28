export const config = {
  "name": "juiceboxDAO",
  "guildId": "889377541675159602",
  "channelId": "889377541675159605",
  "governanceDb": {
    "location": "notion",
    "id": "f667423e111d4c07b6703921f1ae1f3e",
    "filter": {
      "property": "Date",
      "date": {
        "next_week": {}
      }
    },
    "sorts":
    [
      {
        "property": "Date",
        "direction": "ascending"
      }
    ]
  },
  "proposalDb": {
    "location": "notion",
    "id": "785d96f6a860474daef1bb9fa6926edd",
    "filter": { "and" : 
      [
        {
          "property": "Status",
          "select": {
            "equals":"Discussion"
          }
        },
        {
          "property": "Discussion Thread",
          "url": {
            "is_empty":true
          }
        }
      ]
    }
  },
  "cycleDays": 14,
  "temperatureCheck": {
    "length": 3,
    "startDay": "saturday",
    "startTime": "00:00 utc",
    "lockDay": "monday",
    "location": "discord",
  },
  "vote": {
    "length": 4,
    "startDay": "tuesday",
    "startTime": "00:00 utc",
    "loction": "snapshot",
    "url": "https://snapshot.org/#/jbdao.eth"
  },
  "execution": { 
    "length": 4,
    "startDay": "saturday",
    "startTime": "00:00 utc",
    "location": "multisig"
  },
  "delay": {
    "length": 3,
    "startDay": "wednesday",
    "startTime": "19:19 utc",
    "location": "juicebox"
  }
}