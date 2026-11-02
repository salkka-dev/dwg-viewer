// Korean wording for the engine's prompts on the commands this app exposes.
// Merged over the English messages (the engine has no Korean locale), so any
// prompt not listed here simply stays in English. Keyword `local`/`global`
// names are left alone so typed shortcuts keep working; only `display` changes.

const kw = (display: string) => ({ display })

export const KO_PROMPTS = {
  main: {
    commandLine: { canceled: '*취소됨*', invalidInput: '입력이 올바르지 않아요.' },
    mobileCommand: {
      length: '길이',
      angle: '각도',
      confirm: '확인',
      cancel: '취소',
      help: '도움말',
      back: '뒤로',
      collapse: '접기',
      expand: '펼치기'
    },
    inputManager: {
      firstCorner: '첫 모서리를 찍거나 옵션을 고르세요',
      secondCorner: '반대쪽 모서리를 찍거나 옵션을 고르세요'
    },
    touchPointTutorial: {
      title: '점을 정확하게 찍는 법',
      description:
        '화면을 0.5초쯤 길게 누르세요. 손가락 위에 십자선이 생겨 손을 따라 움직이고, 가까운 선과 점에 달라붙어요. 손을 떼면 그 자리가 찍혀요.',
      snoozeToday: '오늘은 그만 보기',
      hideForever: '다시 보지 않기',
      ok: '알겠어요'
    },
    textHeight: {
      title: '글자 높이',
      close: '닫기',
      ok: '확인',
      cancel: '취소',
      adaptive: '화면에 맞추기',
      custom: '높이 직접 입력',
      customPlaceholder: '도면 단위 높이',
      fromScreen: '화면 크기로 정하기',
      fromScreenHint:
        '지금 확대한 상태에서 글자가 화면에 보일 크기를 입력하세요. 도면 단위 높이로 바뀌어서 나중에 확대하거나 축소해도 그대로예요.',
      screenPxPlaceholder: '글자 크기',
      convert: '바꾸기'
    },
    drawStyle: { color: '색', fontSize: '글자 높이' },
    entityPick: { cancel: '선택 취소' },
    colorPicker: { title: '색 고르기', close: '닫기', ok: '확인', cancel: '취소', index: '색 번호: ', input: '색' },
    message: { onLockedLayer: '잠긴 레이어에 있어요.' }
  },
  command: {
    ACAD: {
      erase: { prompt: '지울 객체를 고르고 확인을 누르세요' },
      move: { prompt: '옮길 객체를 고르고 확인을 누르세요' },
      copy: { prompt: '복사할 객체를 고르고 확인을 누르세요' },
      rotate: { prompt: '회전할 객체를 고르고 확인을 누르세요' }
    }
  },
  jig: {
    line: {
      firstPoint: '첫 점을 찍으세요',
      firstPointOrContinue: '첫 점을 찍거나 옵션을 고르세요',
      nextPoint: '다음 점을 찍으세요',
      nextPointWithOptions: '다음 점을 찍거나 옵션을 고르세요. 끝내려면 확인',
      keywords: { continue: kw('이어 그리기(C)'), undo: kw('한 단계 취소(U)'), close: kw('닫기(C)') }
    },
    polyline: {
      firstPoint: '첫 점을 찍으세요',
      nextPoint: '다음 점을 찍으세요. 끝내려면 확인',
      nextPointWithOptions: '다음 점을 찍거나 옵션을 고르세요. 끝내려면 확인',
      nextPointWithArcOptions: '다음 점을 찍거나 옵션을 고르세요. 끝내려면 확인',
      arcAngle: '호의 각도를 입력하세요',
      arcCenter: '호의 중심을 찍으세요',
      arcSecondPoint: '호 위의 두 번째 점을 찍으세요',
      arcEndPoint: '호의 끝점을 찍으세요',
      arcRadius: '호의 반지름을 입력하세요',
      keywords: {
        arc: kw('호(A)'),
        undo: kw('한 단계 취소(U)'),
        close: kw('닫기(C)'),
        line: kw('직선(L)'),
        angle: kw('각도(A)'),
        center: kw('중심(C)'),
        secondPoint: kw('두 번째 점(P)'),
        radius: kw('반지름(R)')
      }
    },
    rect: {
      firstPoint: '첫 모서리를 찍으세요',
      nextPoint: '반대쪽 모서리를 찍으세요',
      firstPointWithOptions: '첫 모서리를 찍거나 옵션을 고르세요',
      otherCornerWithOptions: '반대쪽 모서리를 찍거나 옵션을 고르세요',
      chamferFirst: '첫 번째 모따기 거리를 입력하세요',
      chamferSecond: '두 번째 모따기 거리를 입력하세요',
      filletRadius: '모깎기 반지름을 입력하세요',
      segmentWidth: '선 두께를 입력하세요',
      elevationValue: '고도를 입력하세요',
      thicknessValue: '두께를 입력하세요',
      rotationAngle: '사각형 회전 각도를 입력하세요',
      dimensionLength: '가로 길이를 입력하세요',
      dimensionWidth: '세로 길이를 입력하세요',
      areaValue: '면적을 입력하세요',
      areaLengthOrWidth: '가로 길이를 입력하세요',
      areaSpecifyWidth: '세로 길이를 입력하세요',
      invalidPositive: '0보다 큰 값을 입력하세요.',
      invalidRect: '사각형을 만들 수 없어요. 모서리나 크기를 다시 정하세요.',
      thicknessNotSupported: '두께 값은 아직 저장되지 않아서 무시돼요.',
      keywords: {
        chamfer: kw('모따기(C)'),
        elevation: kw('고도(E)'),
        fillet: kw('모깎기(F)'),
        thickness: kw('두께(T)'),
        width: kw('선 두께(W)'),
        area: kw('면적(A)'),
        dimensions: kw('크기(D)'),
        rotation: kw('회전(R)'),
        length: kw('가로(L)'),
        rectWidth: kw('세로(W)')
      }
    },
    circle: {
      center: '원의 중심을 찍으세요',
      centerOrOptions: '원의 중심을 찍거나 옵션을 고르세요',
      radius: '반지름을 정하세요',
      radiusOrDiameter: '반지름을 정하거나 옵션을 고르세요',
      diameter: '지름을 정하세요',
      twoPointFirst: '지름의 첫 끝점을 찍으세요',
      twoPointSecond: '지름의 다른 끝점을 찍으세요',
      threePointFirst: '원 위의 첫 점을 찍으세요',
      threePointSecond: '원 위의 두 번째 점을 찍으세요',
      threePointThird: '원 위의 세 번째 점을 찍으세요',
      keywords: { threeP: kw('세 점(3P)'), twoP: kw('두 점(2P)'), diameter: kw('지름(D)') }
    },
    arc: {
      startPointOrCenter: '호의 시작점을 찍거나 옵션을 고르세요',
      secondPointOrOptions: '호의 두 번째 점을 찍거나 옵션을 고르세요',
      secondPoint: '호의 두 번째 점을 찍으세요',
      startPoint: '호의 시작점을 찍으세요',
      centerPoint: '호의 중심을 찍으세요',
      endPoint: '호의 끝점을 찍으세요',
      endPointOrOptions: '호의 끝점을 찍거나 옵션을 고르세요',
      centerPointOrOptions: '호의 중심을 찍으세요',
      includedAngle: '사잇각을 입력하세요',
      chordLength: '현의 길이를 입력하세요',
      tangentDirection: '시작점의 접선 방향을 정하세요',
      radius: '호의 반지름을 입력하세요',
      keywords: {
        center: kw('중심(C)'),
        end: kw('끝점(E)'),
        angle: kw('각도(A)'),
        chordLength: kw('현 길이(L)'),
        direction: kw('방향(D)'),
        radius: kw('반지름(R)')
      },
      invalid: {
        threePoint: '세 점이 한 줄에 있어서 호를 만들 수 없어요.',
        center: '시작점과 끝점이 같은 원 위에 있어야 해요.',
        angle: '사잇각은 0도보다 크고 360도보다 작아야 해요.',
        chordLength: '지금 반지름으로는 만들 수 없는 현 길이예요.',
        direction: '이 접선 방향으로는 호를 만들 수 없어요.',
        radius: '이 반지름으로는 시작점과 끝점을 이을 수 없어요.'
      }
    },
    mtext: { point: '글자를 넣을 자리를 찍으세요' },
    dimlinear: {
      xLine1Point: '첫 번째 치수 기준점을 찍으세요. 객체를 고르려면 확인',
      xLine2Point: '두 번째 치수 기준점을 찍으세요',
      dimLinePoint: '치수선을 놓을 자리를 찍으세요',
      selectObject: '치수를 잴 객체를 고르세요',
      rejectObject: '이 객체에는 치수를 넣을 수 없어요.',
      dimensionText: '치수 글자를 입력하세요',
      textAngle: '치수 글자 각도를 정하세요',
      rotationAngle: '치수선 각도를 정하세요',
      keywords: {
        mtext: kw('여러 줄 글자(M)'),
        text: kw('글자(T)'),
        angle: kw('각도(A)'),
        horizontal: kw('가로(H)'),
        vertical: kw('세로(V)'),
        rotated: kw('회전(R)')
      }
    },
    dimaligned: {
      xLine1Point: '첫 번째 치수 기준점을 찍으세요. 객체를 고르려면 확인',
      xLine2Point: '두 번째 치수 기준점을 찍으세요',
      dimLinePoint: '치수선을 놓을 자리를 찍으세요',
      selectObject: '치수를 잴 객체를 고르세요',
      rejectObject: '이 객체에는 사선 치수를 넣을 수 없어요.',
      dimensionText: '치수 글자를 입력하세요',
      textAngle: '치수 글자 각도를 정하세요',
      keywords: { mtext: kw('여러 줄 글자(M)'), text: kw('글자(T)'), angle: kw('각도(A)') }
    },
    revcloud: {
      firstCornerOrOptions: '첫 모서리를 찍거나 옵션을 고르세요',
      firstCorner: '첫 모서리를 찍으세요',
      oppositeCorner: '반대쪽 모서리를 찍으세요',
      startPoint: '시작점을 찍으세요',
      nextPoint: '다음 점을 찍으세요',
      nextPointOrUndo: '다음 점을 찍거나 옵션을 고르세요',
      firstPoint: '첫 점을 찍으세요',
      guideCursor: '구름 모양을 따라 그리세요. 끝내려면 확인',
      arcLength: '구름 호 길이를 입력하세요',
      selectObject: '구름으로 바꿀 객체를 고르세요',
      style: '구름 호 모양을 고르세요',
      reverseDirection: '방향을 뒤집을까요?',
      invalidArcLength: '호 길이는 0보다 커야 해요.',
      invalidObject: '고른 객체는 구름으로 바꿀 수 없어요.',
      keywords: {
        arcLength: kw('호 길이(A)'),
        object: kw('객체(O)'),
        rectangular: kw('사각형(R)'),
        polygonal: kw('다각형(P)'),
        freehand: kw('자유곡선(F)'),
        style: kw('모양(S)'),
        normal: kw('보통(N)'),
        calligraphy: kw('붓글씨(C)'),
        undo: kw('한 단계 취소(U)'),
        yes: kw('예(Y)'),
        no: kw('아니요(N)')
      }
    },
    move: {
      basePointOrDisplacement: '기준점을 찍거나 옵션을 고르세요',
      secondPointOrDisplacement: '옮길 자리를 찍거나 옵션을 고르세요',
      displacement: '이동 거리를 입력하세요',
      keywords: { displacement: kw('거리 입력(D)') }
    },
    copy: {
      basePointOrOptions: '기준점을 찍거나 옵션을 고르세요',
      displacementOrArray: '이동 거리를 정하거나 옵션을 고르세요',
      secondPointOrArray: '복사할 자리를 찍거나 옵션을 고르세요. 끝내려면 확인',
      modePrompt: '복사 방식을 고르세요',
      arrayItemCount: '원본을 포함한 배열 개수를 입력하세요',
      arraySecondPointOrFit: '두 번째 점을 찍거나 옵션을 고르세요',
      arrayFitSecondPoint: '두 번째 점을 찍으세요',
      keywords: {
        displacement: kw('거리 입력(D)'),
        mode: kw('방식(O)'),
        multiple: kw('여러 번(M)'),
        single: kw('한 번(S)'),
        array: kw('배열(A)'),
        fit: kw('맞춤(F)')
      }
    },
    rotate: {
      basePoint: '회전 중심을 찍으세요',
      rotationAngleOrOptions: '회전 각도를 정하거나 옵션을 고르세요',
      referenceAngleOrPoints: '기준 각도를 정하거나 옵션을 고르세요',
      firstReferencePoint: '기준 각도의 첫 점을 찍으세요',
      secondReferencePoint: '두 번째 점을 찍으세요',
      newAngle: '새 각도를 정하세요',
      keywords: { copy: kw('복사(C)'), reference: kw('기준(R)'), points: kw('점(P)') },
      invalid: { referencePoints: '기준점 두 개가 서로 달라야 해요.' }
    },
    offset: {
      distance: '띄울 간격을 입력하세요',
      selectObject: '간격을 띄울 객체를 고르세요. 끝내려면 확인',
      sidePoint: '띄울 쪽을 찍으세요',
      invalidDistance: '간격은 0보다 커야 해요.',
      invalidSelection: '고른 객체는 간격을 띄울 수 없어요.',
      offsetFailed: '그쪽으로는 간격 띄운 선을 만들 수 없어요.'
    }
  }
}
