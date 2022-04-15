export let config = {
  "name": "juiceboxDAO",
  "guildId": "889377541675159602",
  "channelId": "889377541675159605",
  "alertRole": "958529682796605440",
  "poll": {
    "voteYesEmoji": '👍',
    "voteNoEmoji": '👎',
    "minYesVotes": 1,
    "yesNoRatio": 0.3
  },
  "snapshot": {
    "base": "https://snapshot.org/#",
    "space": "jigglyjams.eth"
  },
  "proposalIdPrefix": "JBP-",
  "IpfsGateway": "https://gateway.pinata.cloud/ipfs",
  "proposalIdProperty": "Juicebox Proposal ID",
  "governanceScheduleDb": {
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
    "id": "e129323fd77e4e418ff90a64c5c37fc0",
    "preDiscussionFilter": {
      "and" : [
      {
        "property": "Status",
        "select": {
          "equals":"Discussion"
        }
      },
      {
        "property": "Discussion Thread",
        "url": {
          "is_empty": true
        }
      }]
    },
    "discussionFilter": {
      "and" : [
      {
        "property": "Status",
        "select": {
          "equals":"Discussion"
        }
      },
      {
        "property": "Discussion Thread",
        "url": {
          "is_not_empty": true
        }
      }]
    },
    "proposalIdFilter": {
      "property": null,
      "rich_text": {
        "contains": "JBP-"
      }
    },
    "temperatureCheckFilter": {
      "and" : [
      {
        "property": "Status",
        "select": {
          "equals":"Temperature Check"
        }
      },
      {
        "property": "Temperature Check",
        "url": {
          "is_not_empty": true
        }
      }]
    },
    "proposalIdFilter": {
      "property": null,
      "rich_text": {
        "contains": "JBP-"
      }
    }
  }
}