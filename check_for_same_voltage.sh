#!/bin/bash
BASE_DIR=/tmp
VOLT_FILE=$BASE_DIR/volt_test.txt
VOLT_OLD=$BASE_DIR/volt_test_old.txt
VOLT_DIFF=$BASE_DIR/volt_test_diff.txt
MOPI_CMD=/usr/sbin/mopicli
mkdir -p $BASE_DIR
touch $VOLT_OLD
$MOPI_CMD -v |grep voltage > $VOLT_FILE
if [ -s $VOLT_FILE ]
then
   echo "$VOLT_FILE success"
   diff $VOLT_FILE $VOLT_OLD>$VOLT_DIFF
   cp $VOLT_FILE $VOLT_OLD
   if [ -s $VOLT_DIFF ]
   then
      echo "voltage is different between $VOLT_FILE $VOLT_OLD in $VOLT_DIFF"
   else
      echo "voltage is the same between $VOLT_FILE $VOLT_OLD in $VOLT_DIFF"
      $MOPI_CMD  -won 61
      $MOPI_CMD  -wsd 1
   fi
else
   echo "failure to retreive voltage in $VOLT_FILE"
fi
