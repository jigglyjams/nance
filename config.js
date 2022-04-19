export let config = {
  "name": "juiceboxDAO",
  "guildId": "889377541675159602",
  "channelId": "964601032703352873",
  "alertRole": "958529682796605440",
  "poll": {
    "voteYesEmoji": "👍",
    "voteNoEmoji": "👎",
    "voteGoVoteEmoji": "🗳",
    "voteCanceledEmoji": "❌", 
    "minYesVotes": 1,
    "yesNoRatio": 0.3
  },
  "snapshot": {
    "base": "https://snapshot.org/#",
    "space": "jigglyjams.eth"
  },
  "proposalIdPrefix": "JBP-",
  "ipfsGateway": "https://gateway.pinata.cloud/ipfs",
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
    "id": "0826992a8a214b33ac7107ea285c7802",
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
      "property": "Status",
      "select": {
        "equals":"Temperature Check"
      }
    },
    "proposalIdFilter": {
      "property": null,
      "rich_text": {
        "contains": "JBP-"
      }
    }
  }
}