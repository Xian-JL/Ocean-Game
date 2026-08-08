/*
1.请用户输入方格纸大小n
2.请用户选择兵种
3.请用户输入各个兵种的血量值
4.打印出三个n*n的方格纸
5.请用户依次键入每个兵种的位置
6.每输入完成一个兵种显示其位置
7.显示所有兵种当前血量
8.记录攻击位置并扣除相应血量
*/
#include<iostream>
#include<fstream>
using namespace std;

struct ship
{
	string name;
	int life;
};
void stop()
{
	cout << endl;
	system("pause");
	cout << endl;
}
void printMy(int arrNum[], string arrSig[100][100], string name[], int n, int sle)
{
	cout << name[sle] << ":" << endl;
	cout << "   ";
	for (int i = 0; i < n; i++)
	{
		if (i < 10)
		{
			cout << " " << arrNum[i] << " ";
		}
		else
		{
			cout << arrNum[i] << " ";
		}
	}
	cout << endl;
	for (int i = 0; i < n; i++)
	{
		for (int j = 0; j < n + 1; j++)
		{
			cout << " " << arrSig[i + 1 + sle * n][j + sle * n] << " ";
		}
		cout << endl;
	}
	cout << endl;
}
void printQ(int arrNum[],string arrSig[100][100], string name[], int p, int n)
{
	for (int m = 0; m < p; m++)
	{
		cout << name[m] << ":" << endl;
		cout << "   ";
		for (int i = 0; i < n; i++)
		{
			if (i < 10)
			{
				cout << " " << arrNum[i] << " ";
			}
			else
			{
				cout << arrNum[i] << " ";
			}
		}
		cout << endl;
		for (int i = 0; i < n; i++)
		{
			for (int j = 0; j < n + 1; j++)
			{
				cout << " " << arrSig[i + 1 + m * n][j + m * n] << " ";
			}
			cout << endl;
		}
		cout << endl;
	}
}
void printL(ship array[], int len)
{
	cout << "-------------------" << endl;
	cout << "目前各士兵健康状况" << endl;
	for (int i = 0; i < len; i++)
	{
		cout << array[i].name << "";
		for (int j = 0; j < array[i].life; j++)
		{
			cout << " *";
		}
		cout << endl;
	}
	cout << "-------------------" << endl;
}
void printD(int Cnum, string Nnum[], string Heli[],int H)
{
	cout << "---------------------" << endl;
	cout << "导弹剩余数量：";
	for (int i = 0; i < Cnum; i++)
	{
			cout << "* ";
	}
	cout << endl << "特种弹剩余量：";
	for (int i = 0; i < 4; i++)
	{
		cout << Nnum[i] << " ";
	}
	cout << endl << Heli[H] << endl;
	cout << "---------------------" << endl;
}
int locate(string Char[], string inc, int lenC, int* lie)
{
	int out = 0;
	while(true)
	{
		cin >> *lie;
		cin >> inc;
		for (int i = 0; i < lenC; i++)
		{
			if (inc == Char[i])
			{
				out = i + 1;
			}
		}
		if (out == 0)
		{
			cout << "输入有误，请重新输入正确格式坐标（数字 + 字母）" << endl;
		}
		else
		{
			break;
		}
	}
	return out;
}

int main()
{
	cout << "=========" << endl
		<< "O C E A N" << endl
		<< "=========" << endl << endl;
	cout << "本次更新内容：" << endl
		<< "1.增加坐标填写错误提示" << endl;
	stop();

	cout << "--------------" << endl
		<< "请选择你的功能" << endl
		<< "--------------" << endl;
	cout << "----------------------------" << endl
		<< "1.进入游戏        2.地图存档" << endl
		<< "----------------------------" << endl;
	int start = 0;
	cin >> start;
	switch (start)
	{
	case 1:
		{
		    cout << "----------------------" << endl
	    		<< "请输入本次游戏占地大小" << endl
		    	<< "----------------------" << endl;
	    	int n;
	    	cin >> n;
		    string name[10] = { "我" };
	     	int p;
	    	cout << "----------------------" << endl
		    	<< "请输入本次游戏游戏人数" << endl
		    	<< "----------------------" << endl;
		    cin >> p;
	     	cout << "------------------------------" << endl
		    	<< "请依次输入本次游戏其他玩家名字" << endl
		    	<< "------------------------------" << endl;
	     	for (int i = 0; i < p - 1; i++)
	    	{
		     	cout << "请输入：" << endl;
		    	cin >> name[i + 1];
		    }
		    stop();
			//定义区
			int arrNum[100];
			for (int i = 0; i < n; i++)
			{
				arrNum[i] = i + 1;
			}
			string arrSig[100][100];
			string Char[] = { "a","b","c","d","e","f","g","h","i","j","k","l","m","n","o","p","q","r","s","t" };
			int lenC = sizeof(Char) / sizeof(Char[0]);
			for (int i = 0; i < n; i++)
			{
				for (int j = 0; j < p; j++)
				{
					arrSig[i + 1 + j * n][j * n] = Char[i];
				}
			}
			for (int i = 0; i < n; i++)
			{
				for (int j = 0; j < n; j++)
				{
					for (int k = 0; k < p; k++)
					{
						arrSig[i + 1 + k * n][j + 1 + k * n] = "·";
					}
				}
			}
			ship ship1[] =
			{
			{"驱逐舰Ⅰ", 3},
			{"驱逐舰Ⅱ", 3},
			{"潜水艇", 2},
			{"海盗船", 2},
			{"摩托艇", 1},
			{"核潜艇", 2},
			{"航空母舰", 6},
			{"鱼雷", 1},
			};
			if (n <= 10)
			{
				ship1[0].life = 3;
				ship1[1].life = 3;
				ship1[2].life = 2;
				ship1[3].life = 2;
				ship1[4].life = 1;
				ship1[5].life = 2;
				ship1[6].life = 6;
				ship1[7].life = 1;
			}
			else
			{
				ship ship1[] =
				{
					{"驱逐舰Ⅰ", (n / 5) + 1},
					{"驱逐舰Ⅱ", (n / 5) + 1},
					{"潜水艇", 3},
					{"海盗船", (n / 5)},
					{"摩托艇", 1},
					{"核潜艇", 2},
					{"航空母舰", (2 * n / 5) + 2},
					{"鱼雷", 1},
				};
			}
			int len = sizeof(ship1) / sizeof(ship1[0]);
			int Cnum = (2 * n / 5) - 1;
			string Nnum[] = { "H","H","Z","T" };
			string Heli[] = { "您目前没有直升机", "您目前含有直升机" };
			int H = 1;
			int numT = n / 3;
			ship1[7].life = numT;

			cout << "1.驱逐舰Ⅰ\t" << "2.驱逐舰Ⅱ\t" << "3.潜水艇\t" << "4.海盗船\t" << endl
				<< "5.摩托艇\t" << "6.核潜艇\t" << "7.航空母舰\t" << "8.鱼雷\t" << endl;
			stop();

			printQ(arrNum, arrSig, name, p, n);
			stop();

			int hang, lie;
			string inc;
			cout << "----------------------------" << endl
				<< "请依次输入本次游戏各兵种位置" << endl
				<< "----------------------------" << endl;
			stop();
			cout << "请输入驱逐舰Ⅰ 的位置（大小：1x3）" << endl;
			for (int i = 0; i < 3; i++)
			{
				cout << "请依次输入兵种位置数字坐标与小写字母坐标(回车做，）" << endl;
				hang = locate(Char, inc, lenC, &lie);
				arrSig[hang][lie] = "Ⅰ";
			}
			printMy(arrNum, arrSig, name, n, 0);
			cout << "请输入驱逐舰Ⅱ 的位置（大小：1x4）" << endl;
			for (int i = 0; i < 4; i++)
			{
				cout << "请依次输入兵种位置数字坐标与小写字母坐标(回车做，）" << endl;
				hang = locate(Char, inc, lenC, &lie);
				arrSig[hang][lie] = "Ⅱ";
			}
			printMy(arrNum, arrSig, name, n, 0);
			cout << "请输入潜水艇的位置（大小：2x2）" << endl;
			for (int i = 0; i < 4; i++)
			{
				cout << "请依次输入兵种位置数字坐标与小写字母坐标(回车做，）" << endl;
				hang = locate(Char, inc, lenC, &lie);
				arrSig[hang][lie] = "Q";
			}
			printMy(arrNum, arrSig, name, n, 0);
			cout << "请输入海盗船的位置（大小：（地图长宽/3）向下取整）" << endl;
			for (int i = 0; i < n / 3; i++)
			{
				cout << "请依次输入兵种位置数字坐标与小写字母坐标(回车做，）" << endl;
				hang = locate(Char, inc, lenC, &lie);
				arrSig[hang][lie] = "P";
			}
			printMy(arrNum, arrSig, name, n, 0);
			cout << "请输入摩托艇的位置（大小：1）" << endl;
			for (int i = 0; i < 1; i++)
			{
				cout << "请依次输入兵种位置数字坐标与小写字母坐标(回车做，）" << endl;
				hang = locate(Char, inc, lenC, &lie);
				arrSig[hang][lie] = "M";
			}
			printMy(arrNum, arrSig, name, n, 0);
			cout << "请输入核潜艇的位置（大小：2x2）" << endl;
			for (int i = 0; i < 4; i++)
			{
				cout << "请依次输入兵种位置数字坐标与小写字母坐标(回车做，）" << endl;
				hang = locate(Char, inc, lenC, &lie);
				arrSig[hang][lie] = "H";
			}
			printMy(arrNum, arrSig, name, n, 0);
			cout << "请输入航空母舰的位置（大小：" << ship1[6].life << "）" << endl;
			for (int i = 0; i < ship1[6].life; i++)
			{
				cout << "请依次输入兵种位置数字坐标与小写字母坐标(回车做，）" << endl;
				hang = locate(Char, inc, lenC, &lie);
				arrSig[hang][lie] = "A";
			}
			printMy(arrNum, arrSig, name, n, 0);
			cout << "请输入" << numT << "个鱼雷的位置（大小：1）" << endl;
			for (int i = 0; i < numT; i++)
			{
				cout << "请依次输入兵种位置数字坐标与小写字母坐标(回车做，）" << endl;
				hang = locate(Char, inc, lenC, &lie);
				arrSig[hang][lie] = "*";
			}
			printMy(arrNum, arrSig, name, n, 0);
			stop();

			system("cls");
			cout << "------------------------------" << endl
				<< "确认阶段：是否最后调整你的阵容" << endl
				<< "------------------------------" << endl;
			printMy(arrNum, arrSig, name, n, 0);
			int confirm;
			cout << "+++++++++++++++" << endl
				<< "1.是       2.否" << endl
				<< "+++++++++++++++" << endl;
			cin >> confirm;


			cout << "---------" << endl
				<< "游戏开始！" << endl
				<< "---------" << endl;
			while (ship1[6].life > 0)
			{
				cout << "--------------" << endl
					<< "请选择你的操作" << endl
					<< "--------------" << endl
					<< "+++++++++++++++++++++++++++++++++++++++" << endl
					<< "1.血量    2.弹药     3.地图     4.查看" << endl
					<< "+++++++++++++++++++++++++++++++++++++++" << endl;
				int select;
				cin >> select;
				int choose;
				switch (select)
				{
				case 1:
					printL(ship1, len);
					cout << "--------------" << endl
						<< "请输入扣血对象" << endl
						<< "--------------" << endl;
					cout << "+++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++" << endl
						<< "1.驱逐舰Ⅰ\t" << "2.驱逐舰Ⅱ\t" << "3.潜水艇\t" << "4.海盗船" << endl
						<< "5.摩托艇\t" << "6.核潜艇\t" << "7.航空母舰\t" << "8.鱼雷" << endl
						<< "+++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++" << endl;
					cin >> choose;
					int kill;
					cout << "--------------" << endl
						<< "请输入扣血数量" << endl
						<< "--------------" << endl;
					cin >> kill;
					ship1[choose - 1].life -= kill;
					printL(ship1, len);
					break;
				case 2:
					printD(Cnum, Nnum, Heli, H);
					cout << "--------------" << endl
						<< "请输入扣弹对象" << endl
						<< "--------------" << endl;
					cout << "++++++++++++++++++++++++++++++++++++++++++" << endl
						<< "3.潜水艇  " << "6.核潜艇  " << "7.航空母舰  " << endl
						<< "++++++++++++++++++++++++++++++++++++++++++" << endl;
					cin >> choose;
					switch (choose)
					{
					case 3:
						Cnum -= 1;
						break;
					case 6:
						int shit;
						cout << "--------------" << endl
							<< "请输入扣弹类型" << endl
							<< "--------------" << endl;
						cout << "+++++++++++++++++++++++++++++++++++++++++++++++++++++++++" << endl
							<< "1.核弹一   " << "2.核弹二  " << "3.震爆弹  " << "4.探测弹  " << endl
							<< "+++++++++++++++++++++++++++++++++++++++++++++++++++++++++" << endl;
						cin >> shit;
						Nnum[shit - 1] = " ";
						break;
					case 7:
						H -= 1;
						break;
					}
					printD(Cnum, Nnum, Heli, H);
					break;
				case 3:
					cout << "--------------------------" << endl
						<< "请输入打其他哪位玩家的草稿" << endl
						<< "--------------------------" << endl;
					cout << "+++++++++++++++++++++++" << endl;
					for (int i = 1; i < p; i++)
					{
						cout << i << ".玩家" << i << "    ";
					}
					cout << endl << "+++++++++++++++++++++++" << endl;
					int fuck;
					cin >> fuck;
					cout << "-----------------------------------------" << endl
						<< "请依次输入草稿数字坐标与字母坐标(空格做，)" << endl
						<< "-----------------------------------------" << endl;
					hang = locate(Char, inc, lenC, &lie);
					cout << "--------------" << endl
						<< "请输入草稿类型" << endl
						<< "--------------" << endl;
					cout << "1.确定有（√）  " << "2.确定没有（×）  " << "3.不确定（O）  " << endl;
					cin >> choose;
					switch (choose)
					{
					case 1:
						arrSig[hang + fuck * n][lie + fuck * n] = "√";
						break;
					case 2:
						arrSig[hang + fuck * n][lie + fuck * n] = "×";
						break;
					case 3:
						arrSig[hang + fuck * n][lie + fuck * n] = "O";
						break;
					}
					printMy(arrNum, arrSig, name, n, fuck);
					break;
				case 4:
					printQ(arrNum, arrSig, name, p, n);
					printL(ship1, len);
					printD(Cnum, Nnum, Heli, H);
					break;
				}
			}
			cout << "============" << endl
				<< "你已经很棒了" << endl
				<< "============" << endl;
			system("pause");
			cout << "=============" << endl
				<< "Made in Gipsy" << endl
				<< "=============" << endl;
		}
	    break;
	case 2:
		ofstream outfile;
		outfile.open("d:\\地图模板（请自行重命名）.txt");
		outfile.close();
		break;
	}

	return 0;
}
