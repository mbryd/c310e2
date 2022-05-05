from django.db import models

from . import utils
from .message import Message
from .user import User

class UnreadMessage(utils.CustomModel):
    class Meta:
        unique_together = ((messageId, userId),)

    messageId = models.ForeignKey(Message, on_delete=models.CASCADE)
    # User this message is unread by
    userId = models.ForeignKey(User, on_delete=models.CASCADE)
