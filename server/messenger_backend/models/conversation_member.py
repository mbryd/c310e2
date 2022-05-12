from django.db import models

from . import utils
from .conversation import Conversation
from .user import User

class ConversationMember(utils.CustomModel):
    class Meta:
        unique_together = ((conversationId, userId),)

    conversationId = models.ForeignKey(Conversation, on_delete=models.CASCADE)
    userId = models.ForeignKey(User, on_delete=models.CASCADE)
