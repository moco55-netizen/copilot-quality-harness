# PR Report and AI Review

## Purpose
PRに設計意図、結果、残存リスクを提示し、AIレビューを補助ゲートにする。
## Trigger
テスト結果が確定しDraft PRを作成するとき。
## Required inputs
Issue、差分、テスト設計、テスト結果、未実施項目。
## Procedure
PR本文とSummaryを生成し、差分・受入条件・観点漏れを確認する。
## Output contract
PR本文、レビュー結果、Summary、Artifact、Issueコメント。同一runIdを使用する。
## Stop conditions
結果と本文の不一致、判定不能、残存リスク未記載。
## Do not
AIレビューを人間承認として扱わない。
## Verification
Issue/PR紐付け、差分とテスト対象、重複コメント更新を確認する。
