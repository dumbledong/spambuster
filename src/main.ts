import { Comment, Devvit, MenuItemOnPressEvent, Post, RedditAPIClient } from '@devvit/public-api';

Devvit.configure({
  redditAPI: true
});

Devvit.addSettings([
  {
    type: 'select',
    name: 'listenerObject',
    label: 'Do you want SpamBuster to check posts, comments, or both?',
    options: [
        { label: 'Posts', value: '1' },
        { label: 'Comments', value: '2' },
        { label: 'Posts and comments', value: '3'},
    ],
    multiSelect: false,
  },
  {
    type: 'number',
    name: 'authAge',
    label: 'Enter account age, in months. Any accounts this age and newer will be checked.',
    onValidate:  (event) => {
      if (event.value! <= 0) {
        return 'Please enter an amount over 0'
      }
    }
  },
  {
    type: 'number',
    name: 'authKarma',
    label: 'Enter comment karma to check. Any accounts with this karma or lower will be checked.',
    onValidate:  (event) => {
      if (event.value! <= 0) {
        return 'Please enter an amount over 0'
      }
    }
  }
]);

Devvit.addTrigger({
  events: ['PostSubmit', 'CommentSubmit'],
  async onEvent(event, context){

    const itemType : string = await context.settings.get('listenerObject') as string;
    const user = await context.reddit.getUserById(event.author!.id);
    const itemId : string = await getItemId(event) as string;

    if(event.type === 'PostSubmit' && itemType == "1"){
      var isSpam : boolean = await spamCheck(context, user);
      if(isSpam){
        context.reddit.remove(itemId, true);
        context.reddit.addModNote({
          label: 'SPAM_WARNING',
          subreddit: event.subreddit!.name,
          note: 'Spammed via SpamBuster',
          user: event.author!.name,
          redditId: itemId,
        });
      }  
    } else if(event.type === 'CommentSubmit' && itemType == "2"){
      if(await spamCheck(context, user)){
        context.reddit.remove(itemId, true);
        context.reddit.addModNote({
          label: 'SPAM_WARNING',
          subreddit: event.subreddit!.name,
          note: 'Spammed via SpamBuster',
          user: event.author!.name,
          redditId: itemId,
        });
      } 
    } else if(itemType == "3"){
      if(await spamCheck(context, user)){
        context.reddit.remove(itemId, true);
        context.reddit.addModNote({
          label: 'SPAM_WARNING',
          subreddit: event.subreddit!.name,
          note: 'Spammed via SpamBuster',
          user: event.author!.name,
          redditId: itemId,
        });
      }       
    }
  }
});

Devvit.addMenuItem({
  label: 'Bust spammer',
  location: ['post', 'comment'],
  forUserType: 'moderator',
  onPress: spamPurge,
});

async function getItemId(event):Promise<string>{ 
  if(event.type === 'PostSubmit'){
    return await event.post!.id as string;
  } else if(event.type === 'CommentSubmit'){
    return await event.comment!.id as string;
  } else{
    return 'Could not find item with that ID';
  }
};

async function spamCheck(context, user):Promise<boolean> {
  const authAge : number = await context.settings.get('authAge') as number;
  const now = new Date();
  const dateFrom : Date = user.createdAt as Date;
  const accountAge : number = now.getMonth() - dateFrom.getMonth() + (12 * (now.getFullYear() - dateFrom.getFullYear())) as number;
  const authKarma : number = await context.settings.get('authKarma') as number;
  const userKarma : number = user.commentKarma as number;

  if(accountAge <= authAge && userKarma <= authKarma){
    console.log(`${user.username} does not meet minimum age and karma limits`);
    return true;
  } else {
    return false;
  };
};

async function getThing(event: MenuItemOnPressEvent, context: Devvit.Context){
  const { location, targetId } = event;
  const { reddit } = context;
  if(location === 'post'){
    return await reddit.getPostById(targetId);
  } else if(location === 'comment'){
    return await reddit.getCommentById(targetId);
  }
  throw 'Cannot find a post or comment with that ID';
}

async function spamPurge(event: MenuItemOnPressEvent, context: Devvit.Context){
  const { reddit } = context;
  const thing = await getThing(event, context);
  const user = thing.authorName;
  const targetSubId = thing.subredditId;
  var removeCount : number = 0;

  context.ui.showToast(`Sneaking and snooping ${user}'s account`);

  const userItems: (Comment | Post)[] = await reddit.getCommentsAndPostsByUser({username: user, limit: 128}).all();

  userItems.forEach((item: Comment | Post) => {
    const resultSubId : string = item.subredditId as string;
    if(resultSubId == targetSubId){
      context.reddit.remove(thing.id, true);
        context.reddit.addModNote({
          label: 'SPAM_WARNING',
          subreddit: thing.subredditName,
          note: 'Spammed via SpamBuster',
          user: user,
          redditId: targetSubId,
        });
      console.log(`Item ${item.id} spammed by SpamBuster on subreddit ${thing.subredditName}`);
    } else{
      return;
    }
    removeCount++;
    
  });
  context.ui.showToast(`Purged and spammed ${removeCount} items of ${user}'s content from ${thing.subredditName}.`)

  const currentUser = await reddit.getCurrentUser();
  await reddit.banUser({
    subredditName: thing.subredditName,
    username: thing.authorName,
    context: thing.id!,
    reason: 'Spam',
    note: `Banned via SpamBuster by ${currentUser.username}`,
  });

  context.ui.showToast(`Banned ${user} from ${thing.subredditName}`);
}

export default Devvit;