import { minutesToDays } from "./utils.js"

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
    "space": "jigglyjams.eth",
    "choices": ['For', 'Against', 'Abstain'],
    "votingTimeDays": minutesToDays(10),
    "quroum": 1,
    "passingRatio": 0.66
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
    "id": "50e11ebe3d2440b7a64d39805868df87",
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
    "votingFilter": {
      "and" : [
      {
        "property": "Status",
        "select": {
          "equals": "Voting"
        }
      },
      {
        "property": "Snapshot",
        "url": {
          "is_not_empty": true
        }
      }]
    }
  }
}